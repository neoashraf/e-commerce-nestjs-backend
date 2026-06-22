import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuditService } from '../rbac/application/services/audit.service';
import { AuditResult } from '../rbac/domain/enums/audit-result.enum';
import { Paginated } from '../../shared/dto/paginated';
import { CustomerDirectoryReader, DirectoryFilter } from './customers-directory.reader';
import { CustomerAccountActionType, CustomerStatus } from './customers.enums';
import { CustomerAccountActionEntity } from './entities/customer-account-action.entity';
import { CustomerNoteEntity } from './entities/customer-note.entity';
import {
  CreateNoteResultDto,
  CustomerListItemDto,
  CustomerProfileDto,
  NoteDto,
  ReactivateResultDto,
  SuspendResultDto,
} from './dto/customer-responses';
import { AUTH_CUSTOMER_GATEWAY, IAuthCustomerGateway } from './ports/auth-customer.port';
import { ILeadSource, LEAD_SOURCE } from './ports/lead-source.port';
import { IOrderStats, ORDER_STATS } from './ports/order-stats.port';
import { AdminWishlistItem, IWishlistSource, WISHLIST_SOURCE } from './ports/wishlist-source.port';

const RECENT_ORDERS_LIMIT = 10;
const LINKED_LEADS_LIMIT = 10;

/**
 * Customer management (CUST, SRS 12). Read-only over customer-owned data (BR-CUST-1): the directory and
 * 360 profile compose AUTH identity/addresses, ORD orders/LTV (net of refunds — BR-CUST-3), LEAD
 * enquiries, and WISH count via read ports; the only writes are admin annotations (notes) and the
 * suspend/reactivate actions that AUTH executes (status + session revoke — BR-CUST-2), each audited via
 * RBAC (BR-CUST-6). Tags + export live in the sibling tag/export services.
 */
@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(CustomerNoteEntity) private readonly notes: Repository<CustomerNoteEntity>,
    @InjectRepository(CustomerAccountActionEntity)
    private readonly actions: Repository<CustomerAccountActionEntity>,
    private readonly directory: CustomerDirectoryReader,
    @Inject(AUTH_CUSTOMER_GATEWAY) private readonly auth: IAuthCustomerGateway,
    @Inject(ORDER_STATS) private readonly orders: IOrderStats,
    @Inject(LEAD_SOURCE) private readonly leads: ILeadSource,
    @Inject(WISHLIST_SOURCE) private readonly wishlist: IWishlistSource,
    private readonly audit: AuditService,
  ) {}

  // ── Directory (FR-CUST-001–004) ──────────────────────────────────────────

  async list(query: {
    q?: string;
    status?: string;
    tag?: string;
    has_orders?: string;
    include_guests?: string;
    registration_from?: string;
    registration_to?: string;
    last_order_from?: string;
    last_order_to?: string;
    page?: number;
    limit?: number;
  }): Promise<Paginated<CustomerListItemDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const filter: DirectoryFilter = {
      q: query.q?.trim() || undefined,
      status: query.status,
      tag: query.tag,
      hasOrders: this.parseBool(query.has_orders),
      includeGuests: this.parseBool(query.include_guests) ?? false,
      registrationFrom: query.registration_from,
      registrationTo: query.registration_to,
      lastOrderFrom: query.last_order_from,
      lastOrderTo: query.last_order_to,
      page,
      limit,
    };

    const { rows, total } = await this.directory.query(filter);
    const registeredIds = rows.filter((r) => !r.isGuest && r.customerId).map((r) => r.customerId as string);
    const tagMap = await this.directory.getTagsFor(registeredIds);

    const items: CustomerListItemDto[] = rows.map((r) => ({
      customer_id: r.customerId,
      full_name: r.fullName,
      phone: r.phone,
      email: r.email,
      status: r.status,
      tags: r.customerId ? tagMap.get(r.customerId) ?? [] : [],
      order_count: r.orderCount,
      total_spent: r.totalSpent,
      last_order_at: r.lastOrderAt,
      is_guest: r.isGuest,
    }));

    return new Paginated(items, { page, limit, total });
  }

  // ── 360 profile (FR-CUST-010–014) ────────────────────────────────────────

  async getProfile(customerId: string): Promise<CustomerProfileDto> {
    const identity = await this.requireCustomer(customerId);
    const [addresses, aggregates, recentOrders, leads, wishlistCount, tagMap] = await Promise.all([
      this.auth.getAddresses(customerId),
      this.orders.getProfileAggregates(customerId),
      this.orders.getRecentOrders(customerId, RECENT_ORDERS_LIMIT),
      this.leads.getLeadsForCustomer(customerId, LINKED_LEADS_LIMIT),
      this.wishlist.getCount(customerId),
      this.directory.getTagsFor([customerId]),
    ]);

    return {
      customer_id: identity.customerId,
      full_name: identity.fullName,
      phone: identity.phone,
      phone_verified: identity.phoneVerified,
      email: identity.email,
      email_verified: identity.emailVerified,
      gender: identity.gender,
      date_of_birth: identity.dateOfBirth,
      status: identity.status,
      preferences: {
        promo_sms_opt_in: identity.promoSmsOptIn,
        promo_email_opt_in: identity.promoEmailOptIn,
      },
      tags: tagMap.get(customerId) ?? [],
      addresses: addresses.map((a) => ({
        id: a.id,
        address_line: a.addressLine,
        district: a.district,
        is_default: a.isDefault,
      })),
      aggregates: {
        order_count: aggregates.orderCount,
        total_spent: aggregates.totalSpent,
        avg_order_value: aggregates.avgOrderValue,
        first_order_at: aggregates.firstOrderAt,
        last_order_at: aggregates.lastOrderAt,
      },
      recent_orders: recentOrders.map((o) => ({
        order_no: o.orderNo,
        status: o.status,
        grand_total: o.grandTotal,
        placed_at: o.placedAt,
      })),
      leads: leads.map((l) => ({ reference: l.reference, type: l.type, status: l.status })),
      wishlist_count: wishlistCount,
    };
  }

  /**
   * A customer's wishlist items for the 360 Wishlist panel (FR-CUST-013), read live over WISH
   * (price/availability per BR-WISH-2). 404s an unknown customer; a customer with no/empty wishlist
   * returns `[]`. Read-only — the admin never mutates another customer's wishlist (BR-CUST-1).
   */
  async getWishlist(customerId: string): Promise<AdminWishlistItem[]> {
    await this.requireCustomer(customerId);
    return this.wishlist.getItems(customerId);
  }

  // ── Account actions (FR-CUST-020–023, BR-CUST-2/4/5/6) ────────────────────

  async suspend(customerId: string, adminId: string, reason?: string): Promise<SuspendResultDto> {
    const identity = await this.requireActionable(customerId);
    await this.auth.setStatus(customerId, CustomerStatus.SUSPENDED);
    const revoked = await this.auth.revokeSessions(customerId);
    await this.recordAction(customerId, adminId, CustomerAccountActionType.SUSPEND, reason ?? null);
    void this.audit.record({
      actorAdminId: adminId,
      action: 'customers.customer.suspend',
      result: AuditResult.SUCCESS,
      entityType: 'customer',
      entityId: customerId,
      summary: { reason: reason ?? null, sessions_revoked: revoked },
    });
    void identity;
    return { customer_id: customerId, status: CustomerStatus.SUSPENDED, sessions_revoked: true };
  }

  async reactivate(customerId: string, adminId: string): Promise<ReactivateResultDto> {
    await this.requireActionable(customerId);
    await this.auth.setStatus(customerId, CustomerStatus.ACTIVE);
    await this.recordAction(customerId, adminId, CustomerAccountActionType.REACTIVATE, null);
    void this.audit.record({
      actorAdminId: adminId,
      action: 'customers.customer.reactivate',
      result: AuditResult.SUCCESS,
      entityType: 'customer',
      entityId: customerId,
    });
    return { status: CustomerStatus.ACTIVE };
  }

  // ── Notes (FR-CUST-030, BR-CUST-7) ───────────────────────────────────────

  async listNotes(customerId: string): Promise<NoteDto[]> {
    await this.requireCustomer(customerId);
    const rows = await this.notes.find({ where: { customerId }, order: { createdAt: 'DESC' } });
    return rows.map((n) => ({
      id: n.id,
      body: n.body,
      admin_id: n.adminId,
      created_at: n.createdAt.toISOString(),
    }));
  }

  async addNote(customerId: string, adminId: string, body: string): Promise<CreateNoteResultDto> {
    await this.requireCustomer(customerId);
    const note = await this.notes.save(this.notes.create({ customerId, adminId, body }));
    return { id: note.id, created_at: note.createdAt.toISOString() };
  }

  // ── Shared ───────────────────────────────────────────────────────────────

  /** Load a customer or 404. */
  private async requireCustomer(customerId: string) {
    const identity = await this.auth.getIdentity(customerId);
    if (!identity) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOT_FOUND',
        message: `Customer ${customerId} not found.`,
      });
    }
    return identity;
  }

  /** Load a customer that can be actioned; deleted/anonymized accounts are blocked with 409 (FR-CUST-022). */
  private async requireActionable(customerId: string) {
    const identity = await this.requireCustomer(customerId);
    if (identity.status === CustomerStatus.DELETED) {
      throw new ConflictException({
        code: 'CUSTOMER_DELETED',
        message: 'Account is deleted/anonymized and cannot be actioned.',
      });
    }
    return identity;
  }

  private async recordAction(
    customerId: string,
    adminId: string,
    action: CustomerAccountActionType,
    reason: string | null,
  ): Promise<void> {
    await this.actions.save(this.actions.create({ customerId, adminId, action, reason }));
  }

  private parseBool(value?: string): boolean | undefined {
    if (value === undefined) return undefined;
    return value === 'true' || value === '1';
  }
}
