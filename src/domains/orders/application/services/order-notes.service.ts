import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AdminUserOrmEntity } from '../../../rbac/infrastructure/persistence/typeorm/entities/admin-user.orm-entity';
import { RoleOrmEntity } from '../../../rbac/infrastructure/persistence/typeorm/entities/role.orm-entity';
import { OrderNoteOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order-note.orm-entity';
import { OrderOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order.orm-entity';
import { OrderNoteEntryDto } from '../../presentation/dto/order-note.dto';

/**
 * Builds the attributed notes thread for an order (FR-ORD-072b). Combines the customer's order note
 * (if present on the Order entity) with all admin-authored OrderNote records, sorted chronologically.
 * Each entry carries who wrote it (customer name or admin display name + role), the body, and a
 * timestamp. Admin-authored notes are never surfaced in the customer-facing detail (BR-ORD-15).
 */
@Injectable()
export class OrderNotesService {
  constructor(
    @InjectRepository(OrderOrmEntity) private readonly orders: Repository<OrderOrmEntity>,
    @InjectRepository(OrderNoteOrmEntity) private readonly notes: Repository<OrderNoteOrmEntity>,
    @InjectRepository(AdminUserOrmEntity) private readonly admins: Repository<AdminUserOrmEntity>,
    @InjectRepository(RoleOrmEntity) private readonly roles: Repository<RoleOrmEntity>,
  ) {}

  /**
   * Load the attributed notes thread for an order. Throws `404` when the order is unknown.
   * Returns entries sorted ascending by `created_at` (chronological, oldest first).
   */
  async getThread(orderNo: string): Promise<OrderNoteEntryDto[]> {
    const order = await this.orders.findOne({ where: { orderNo } });
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `Order ${orderNo} not found.` });
    return this.buildThread(order);
  }

  /**
   * Assemble the attributed thread from an already-loaded order entity. Used by the admin detail
   * read so we don't re-fetch the order when it was already loaded for the detail DTO.
   */
  async buildThread(order: OrderOrmEntity): Promise<OrderNoteEntryDto[]> {
    const adminNotes = await this.notes.find({
      where: { orderId: order.id },
      order: { createdAt: 'ASC' },
    });

    // Resolve admin names + role labels in one batch (deduplicate by roleId).
    const adminIdSet = new Set(adminNotes.map((n) => n.authorAdminId).filter((id): id is string => !!id));
    const adminMap = await this.resolveAdmins([...adminIdSet]);

    const thread: OrderNoteEntryDto[] = [];

    // Customer note comes first (chronologically it was written at placement, FR-ORD-072a).
    if (order.customerNote) {
      const customerName =
        order.guestName ?? order.addressSnapshot?.recipient_name ?? 'Customer';
      thread.push({
        id: 'note_customer',
        author_type: 'customer',
        author_name: customerName,
        body: order.customerNote,
        created_at: order.placedAt.toISOString(),
      });
    }

    for (const note of adminNotes) {
      thread.push({
        id: note.id,
        author_type: 'admin',
        author_name: note.authorAdminId ? (adminMap.get(note.authorAdminId) ?? 'Admin') : 'Admin',
        body: note.body,
        created_at: note.createdAt.toISOString(),
      });
    }

    // Sort by created_at ascending (customer note's placedAt vs admin note timestamps).
    thread.sort((a, b) => a.created_at.localeCompare(b.created_at));

    return thread;
  }

  /**
   * Save a new admin-authored note and return its attributed entry (FR-ORD-072). Used by the
   * FulfilmentService so the POST response includes full attribution in one call.
   */
  async addAdminNote(
    orderNo: string,
    body: string,
    adminId: string,
  ): Promise<{ id: string; entry: OrderNoteEntryDto }> {
    const order = await this.orders.findOne({ where: { orderNo } });
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `Order ${orderNo} not found.` });

    const repo = this.notes;
    const saved = await repo.save(repo.create({ orderId: order.id, body, authorAdminId: adminId }));

    const adminMap = await this.resolveAdmins([adminId]);
    const entry: OrderNoteEntryDto = {
      id: saved.id,
      author_type: 'admin',
      author_name: adminMap.get(adminId) ?? 'Admin',
      body: saved.body,
      created_at: saved.createdAt.toISOString(),
    };
    return { id: saved.id, entry };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve a set of admin ids to their display strings `"{fullName} ({roleName})"`. Batches the
   * admin + role lookups. Unknown ids map to `"Admin"`.
   */
  private async resolveAdmins(adminIds: string[]): Promise<Map<string, string>> {
    if (adminIds.length === 0) return new Map();

    const adminUsers = await this.admins
      .createQueryBuilder('u')
      .whereInIds(adminIds)
      .select(['u.id', 'u.fullName', 'u.roleId'])
      .getMany();

    const roleIds = [...new Set(adminUsers.map((u) => u.roleId))];
    const roleEntities = roleIds.length
      ? await this.roles.createQueryBuilder('r').whereInIds(roleIds).select(['r.id', 'r.name']).getMany()
      : [];
    const roleMap = new Map(roleEntities.map((r) => [r.id, r.name]));

    const result = new Map<string, string>();
    for (const u of adminUsers) {
      const roleName = roleMap.get(u.roleId);
      result.set(u.id, roleName ? `${u.fullName} (${roleName})` : u.fullName);
    }
    return result;
  }
}
