import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import {
  AdminNotificationBus,
  AdminNotificationView,
  toAdminNotificationView,
} from './admin-notification-bus';
import { AdminNotificationEntity } from './entities/admin-notification.entity';
import {
  ADMIN_RECIPIENT_RESOLVER,
  IAdminRecipientResolver,
} from './ports/admin-recipient-resolver.port';

/** RBAC permission whose holders are alerted on a new order (FR-ORD-050a, FR-NOTIF-070). */
const ORDERS_READ_PERMISSION = 'orders.order.read';

/** Context for a new-order admin alert (subset of the ORD placement snapshot). */
export interface OrderPlacedAlertInput {
  orderId: string;
  orderNo: string;
  grandTotal: string;
  itemCount: number;
  customerName: string;
  paymentMethod: string;
}

export interface AdminFeedQuery {
  unread?: boolean;
  page?: number;
  limit?: number;
}

export interface AdminFeedPage {
  rows: AdminNotificationView[];
  page: number;
  limit: number;
  total: number;
  unread: number;
}

interface AdminAlertSpec {
  eventType: string;
  type: string;
  permissionCode: string;
  idempotencyKey: string;
  title: string;
  body: string | null;
  link: string | null;
  data: Record<string, unknown> | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
}

/**
 * In-app admin notification feed (NOTIF SRS 09 §5.8, FR-NOTIF-070–076). Creates one durable feed row
 * per eligible admin (fan-out on write), pushes each to the real-time bus, and serves the per-admin
 * feed (list / unread-count / mark-read). The feed is authoritative; the bus is a best-effort
 * accelerator (BR-NOTIF-11).
 */
@Injectable()
export class AdminNotificationService {
  private readonly logger = new Logger(AdminNotificationService.name);

  constructor(
    @InjectRepository(AdminNotificationEntity)
    private readonly repo: Repository<AdminNotificationEntity>,
    private readonly bus: AdminNotificationBus,
    @Inject(ADMIN_RECIPIENT_RESOLVER)
    private readonly recipients: IAdminRecipientResolver,
  ) {}

  /** New-order alert to admins with order access (FR-ORD-050a). */
  async emitOrderPlaced(input: OrderPlacedAlertInput): Promise<void> {
    const total = formatBdt(input.grandTotal);
    const itemLabel = `${input.itemCount} ${input.itemCount === 1 ? 'item' : 'items'}`;
    await this.emitToPermissionedAdmins({
      eventType: 'order.placed',
      type: 'order',
      permissionCode: ORDERS_READ_PERMISSION,
      idempotencyKey: `order.placed:${input.orderId}`,
      title: `New order ${input.orderNo}`,
      body: `${total} · ${itemLabel} · ${input.customerName} · ${input.paymentMethod.toUpperCase()}`,
      link: `/admin/orders/${input.orderNo}`,
      data: {
        order_no: input.orderNo,
        grand_total: input.grandTotal,
        item_count: input.itemCount,
        customer_name: input.customerName,
        payment_method: input.paymentMethod,
      },
      relatedEntityType: 'Order',
      relatedEntityId: input.orderId,
    });
  }

  /**
   * Resolve recipient admins by permission and create one feed row each, deduped by idempotency key
   * (FR-NOTIF-070/076, BR-NOTIF-10/13). Each created row is published to the real-time bus.
   * An empty recipient set is a logged no-op (§11).
   */
  private async emitToPermissionedAdmins(spec: AdminAlertSpec): Promise<void> {
    const adminIds = await this.recipients.findAdminIdsByPermission(spec.permissionCode);
    if (adminIds.length === 0) {
      this.logger.warn(
        `No admins hold "${spec.permissionCode}" — in-app ${spec.eventType} alert created for 0 recipients.`,
      );
      return;
    }

    for (const adminId of adminIds) {
      const created = await this.createForAdmin(adminId, spec);
      if (created) this.bus.publish(adminId, toAdminNotificationView(created));
    }
  }

  /** Insert one feed row; returns null if a row with this (admin, idempotency_key) already exists. */
  private async createForAdmin(
    adminId: string,
    spec: AdminAlertSpec,
  ): Promise<AdminNotificationEntity | null> {
    const entity = this.repo.create({
      recipientAdminId: adminId,
      eventType: spec.eventType,
      type: spec.type,
      title: spec.title,
      body: spec.body,
      link: spec.link,
      data: spec.data,
      relatedEntityType: spec.relatedEntityType,
      relatedEntityId: spec.relatedEntityId,
      isRead: false,
      readAt: null,
      idempotencyKey: spec.idempotencyKey,
    });
    try {
      return await this.repo.save(entity);
    } catch (err) {
      // Partial-unique (recipient_admin_id, idempotency_key) violation → a re-fired trigger; skip
      // silently (idempotent, FR-NOTIF-076). Re-throw anything else.
      if (err instanceof QueryFailedError && isUniqueViolation(err)) return null;
      throw err;
    }
  }

  /** A single admin's feed, most-recent-first, optionally unread-only (FR-NOTIF-073). */
  async listForAdmin(adminId: string, query: AdminFeedQuery): Promise<AdminFeedPage> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    const qb = this.repo
      .createQueryBuilder('n')
      .where('n.recipient_admin_id = :adminId', { adminId });
    if (query.unread) qb.andWhere('n.is_read = false');

    const [rows, total] = await qb
      .orderBy('n.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const unread = await this.unreadCount(adminId);
    return { rows: rows.map(toAdminNotificationView), page, limit, total, unread };
  }

  /** Current unread count for an admin (FR-NOTIF-073). */
  unreadCount(adminId: string): Promise<number> {
    return this.repo.count({ where: { recipientAdminId: adminId, isRead: false } });
  }

  /**
   * Mark one of the admin's own notifications read (FR-NOTIF-074). Idempotent: an unknown/not-owned
   * /already-read id simply returns the current unread count without error (§11).
   */
  async markRead(adminId: string, id: string): Promise<{ id: string; isRead: boolean; unread: number }> {
    await this.repo.update(
      { id, recipientAdminId: adminId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
    return { id, isRead: true, unread: await this.unreadCount(adminId) };
  }

  /** Mark all of the admin's unread notifications read (FR-NOTIF-074). */
  async markAllRead(adminId: string): Promise<{ marked: number; unread: number }> {
    const result = await this.repo.update(
      { recipientAdminId: adminId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
    return { marked: result.affected ?? 0, unread: 0 };
  }

  /** Live stream for the SSE endpoint (FR-NOTIF-071). */
  streamFor(adminId: string): ReturnType<AdminNotificationBus['streamFor']> {
    return this.bus.streamFor(adminId);
  }
}

/** `12620.00` → `৳ 12,620.00` for the alert body (BDT, SRS §6 money formatting). */
function formatBdt(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `৳ ${amount}`;
  return `৳ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isUniqueViolation(err: QueryFailedError): boolean {
  // Postgres unique_violation = 23505.
  return (err as QueryFailedError & { code?: string }).code === '23505';
}
