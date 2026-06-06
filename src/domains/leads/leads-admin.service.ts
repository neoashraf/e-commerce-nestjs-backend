import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';

import { PermissionService } from '../rbac/application/services/permission.service';
import { LeadAttachmentEntity } from './entities/lead-attachment.entity';
import { LeadMessageEntity } from './entities/lead-message.entity';
import { LeadEntity } from './entities/lead.entity';
import { LeadStatus, LeadType, MessageChannel, MessageDirection } from './leads.enums';
import {
  ILeadNotifier,
  LEAD_NOTIFIER,
} from './ports/lead-notifier.port';
import {
  EXCHANGE_HANDOFF,
  IExchangeHandoff,
} from './ports/exchange-handoff.port';
import {
  AdminLeadDetailDto,
  AdminLeadListItemDto,
  AdminReplyResultDto,
  AssignLeadResultDto,
  ChangeStatusResultDto,
  HandoffAction,
  HandoffExchangeDto,
  HandoffExchangeResultDto,
  InternalNoteResultDto,
} from './dto/admin-lead.dto';
import { Paginated } from '../../shared/dto/paginated';

/** Permission required (in addition to `leads.lead.respond`) to hand a claim off to ORD (FR-LEAD-016). */
const EXCHANGE_REVIEW_PERMISSION = 'orders.exchange.review';

/**
 * Admin communication inbox (FR-LEAD-010–016; contract: Admin — Inbox). Filterable list, full detail
 * (thread incl. internal notes + links + attachments), assign/reassign, reply (delivered via the NOTIF
 * port + threaded; undelivered flagged — §12.9), internal notes (never delivered — BR-LEAD-7), status
 * changes, and the claim → exchange/cancel handoff to ORD via a port (exchange-only — BR-LEAD-3). Builds
 * on the lead-core entities; cross-module effects (NOTIF reply, ORD handoff) go through ports.
 */
@Injectable()
export class LeadsAdminService {
  private readonly logger = new Logger(LeadsAdminService.name);

  constructor(
    @InjectRepository(LeadEntity) private readonly leads: Repository<LeadEntity>,
    @InjectRepository(LeadMessageEntity) private readonly messages: Repository<LeadMessageEntity>,
    @InjectRepository(LeadAttachmentEntity)
    private readonly attachments: Repository<LeadAttachmentEntity>,
    @Inject(LEAD_NOTIFIER) private readonly notifier: ILeadNotifier,
    @Inject(EXCHANGE_HANDOFF) private readonly handoff: IExchangeHandoff,
    private readonly permissions: PermissionService,
  ) {}

  // ── List (FR-LEAD-010) ───────────────────────────────────────────────────

  async list(filters: {
    status?: LeadStatus;
    type?: LeadType;
    assignee?: string;
    order?: string;
    from?: string;
    to?: string;
    page: number;
    limit: number;
  }): Promise<Paginated<AdminLeadListItemDto>> {
    const where: FindOptionsWhere<LeadEntity> = {};
    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;
    if (filters.assignee) where.assignedAdminId = filters.assignee;
    if (filters.order) where.orderReference = filters.order;

    const createdAt = this.dateRange(filters.from, filters.to);
    if (createdAt) where.createdAt = createdAt;

    const [rows, total] = await this.leads.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    });

    const items = rows.map((l) => ({
      reference: l.reference,
      type: l.type,
      subject: l.subject,
      submitter: { name: l.submitterName, phone: l.submitterPhone },
      status: l.status,
      assigned_admin_id: l.assignedAdminId,
      order_reference: l.orderReference,
      created_at: l.createdAt.toISOString(),
    }));
    return new Paginated(items, { page: filters.page, limit: filters.limit, total });
  }

  /** Build a TypeORM created_at constraint from optional inclusive `from`/`to` bounds. */
  private dateRange(from?: string, to?: string) {
    const start = this.parseDate(from, false);
    const end = this.parseDate(to, true);
    if (start && end) return Between(start, end);
    if (start) return MoreThanOrEqual(start);
    if (end) return LessThanOrEqual(end);
    return undefined;
  }

  /** Parse an ISO date/datetime; a date-only `to` bound expands to end-of-day so the day is inclusive. */
  private parseDate(value: string | undefined, isEnd: boolean): Date | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException({ code: 'INVALID_DATE', message: `Invalid date: ${value}` });
    }
    if (isEnd && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      date.setUTCHours(23, 59, 59, 999);
    }
    return date;
  }

  // ── Detail (FR-LEAD-011) ─────────────────────────────────────────────────

  async getDetail(reference: string): Promise<AdminLeadDetailDto> {
    const lead = await this.requireLead(reference);
    const [messages, attachments] = await Promise.all([
      this.messages.find({ where: { leadId: lead.id }, order: { createdAt: 'ASC' } }),
      this.attachments.find({ where: { leadId: lead.id }, order: { createdAt: 'ASC' } }),
    ]);

    return {
      reference: lead.reference,
      type: lead.type,
      subject: lead.subject,
      status: lead.status,
      source: lead.source,
      assigned_admin_id: lead.assignedAdminId,
      submitter: {
        name: lead.submitterName,
        phone: lead.submitterPhone,
        email: lead.submitterEmail,
      },
      links: {
        customer_id: lead.customerId,
        order_id: lead.orderId,
        order_reference: lead.orderReference,
        product_id: lead.productId,
      },
      messages: messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        author_admin_id: m.authorAdminId,
        body: m.body,
        channel: m.channel,
        is_internal_note: m.isInternalNote,
        created_at: m.createdAt.toISOString(),
      })),
      attachments: attachments.map((a) => ({
        id: a.id,
        url: a.url,
        content_type: a.contentType,
        size_bytes: a.sizeBytes,
      })),
      created_at: lead.createdAt.toISOString(),
      updated_at: lead.updatedAt.toISOString(),
    };
  }

  // ── Assign / reassign (FR-LEAD-012) ──────────────────────────────────────

  async assign(reference: string, adminId: string): Promise<AssignLeadResultDto> {
    const lead = await this.requireLead(reference);
    lead.assignedAdminId = adminId;
    await this.leads.save(lead);
    return { reference: lead.reference, assigned_admin_id: adminId };
  }

  // ── Reply (FR-LEAD-013, §12.9) ───────────────────────────────────────────

  async reply(
    reference: string,
    body: string,
    channel: MessageChannel,
    authorAdminId: string,
  ): Promise<AdminReplyResultDto> {
    const lead = await this.requireLead(reference);

    // The chosen channel must be available for the submitter (§11 reply rule; BR-LEAD-8).
    if (channel === MessageChannel.EMAIL && !lead.submitterEmail) {
      throw new BadRequestException({
        code: 'CHANNEL_UNAVAILABLE',
        message: 'The submitter has no email; reply via SMS instead.',
      });
    }

    // Append the outbound reply first so it is never lost, even if delivery fails (NFR reliability).
    const message = await this.messages.save(
      this.messages.create({
        leadId: lead.id,
        direction: MessageDirection.OUTBOUND,
        authorAdminId,
        body,
        channel,
        isInternalNote: false,
      }),
    );

    // Deliver via NOTIF (best-effort). A failure flags the reply undelivered (§12.9) via an internal note.
    let status: 'queued' | 'failed' = 'failed';
    try {
      const delivery = await this.notifier.deliverReply({
        reference: lead.reference,
        channel,
        body,
        recipientEmail: lead.submitterEmail,
        recipientPhone: lead.submitterPhone,
      });
      status = delivery.status;
    } catch (err) {
      this.logger.warn(`Reply delivery failed for ${reference}: ${(err as Error).message}`);
    }

    if (status === 'failed') {
      await this.messages.save(
        this.messages.create({
          leadId: lead.id,
          direction: MessageDirection.OUTBOUND,
          authorAdminId,
          body: `⚠ Reply delivery failed via ${channel}. Flagged for retry / alternate channel.`,
          isInternalNote: true,
        }),
      );
    }

    return { message_id: message.id, delivery: { channel, status } };
  }

  // ── Internal note (FR-LEAD-015, BR-LEAD-7) ───────────────────────────────

  async addNote(reference: string, body: string, authorAdminId: string): Promise<InternalNoteResultDto> {
    const lead = await this.requireLead(reference);
    const message = await this.messages.save(
      this.messages.create({
        leadId: lead.id,
        direction: MessageDirection.OUTBOUND,
        authorAdminId,
        body,
        isInternalNote: true,
      }),
    );
    return { message_id: message.id, is_internal_note: true };
  }

  // ── Status (FR-LEAD-014) ─────────────────────────────────────────────────

  async changeStatus(reference: string, status: LeadStatus): Promise<ChangeStatusResultDto> {
    const lead = await this.requireLead(reference);
    lead.status = status;
    await this.leads.save(lead);
    return { reference: lead.reference, status: lead.status };
  }

  // ── Claim → exchange/cancel handoff (FR-LEAD-016, BR-LEAD-3) ──────────────

  async handoffExchange(
    reference: string,
    dto: HandoffExchangeDto,
    admin: { adminId: string; roleId: string },
  ): Promise<HandoffExchangeResultDto> {
    // Additional gate beyond `leads.lead.respond`: the actor must also be able to review exchanges.
    const canReview = await this.permissions.hasPermission(admin.roleId, EXCHANGE_REVIEW_PERMISSION);
    if (!canReview) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `Handoff requires the ${EXCHANGE_REVIEW_PERMISSION} permission.`,
      });
    }

    const lead = await this.requireLead(reference);

    const result = await this.handoff.initiate({
      leadReference: lead.reference,
      orderReference: dto.order_reference,
      orderItemId: dto.order_item_id,
      action: dto.action,
      reason: dto.reason,
      actorAdminId: admin.adminId,
    });

    // Record the linkage on the lead: ensure the order reference is linked and log an internal note.
    if (!lead.orderReference) {
      lead.orderReference = dto.order_reference;
      await this.leads.save(lead);
    }
    const label = dto.action === HandoffAction.EXCHANGE ? 'Exchange' : 'Pre-dispatch cancellation';
    await this.messages.save(
      this.messages.create({
        leadId: lead.id,
        direction: MessageDirection.OUTBOUND,
        authorAdminId: admin.adminId,
        body:
          `${label} handed off to Orders for ${dto.order_reference} item ${dto.order_item_id} ` +
          `(reason: ${dto.reason})` +
          (result.exchangeId ? ` — exchange ${result.exchangeId}` : ''),
        isInternalNote: true,
      }),
    );

    return {
      order_reference: dto.order_reference,
      handoff: result.handoff,
      exchange_id: result.exchangeId,
      linked: true,
    };
  }

  // ── Shared ───────────────────────────────────────────────────────────────

  private async requireLead(reference: string): Promise<LeadEntity> {
    const lead = await this.leads.findOne({ where: { reference } });
    if (!lead) {
      throw new NotFoundException({ code: 'LEAD_NOT_FOUND', message: `Lead ${reference} not found.` });
    }
    return lead;
  }
}
