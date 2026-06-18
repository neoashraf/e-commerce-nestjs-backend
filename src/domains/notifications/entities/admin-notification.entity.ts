import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * In-app admin notification feed item (NOTIF SRS 09 §8 AdminNotification; FR-NOTIF-070–076).
 *
 * The admin-facing `in_app` channel uses this dedicated entity — NOT the provider
 * `NotificationEntity` delivery log: it is not template-rendered and has no provider/DLR/segment
 * fields. **One row per recipient admin** (fan-out on write), so read state is naturally per-admin
 * (BR-NOTIF-10/11/12). The durable feed is authoritative; the SSE stream is a best-effort accelerator.
 */
@Entity('admin_notifications')
// Feed reads: list/unread-count for one admin, most-recent-first.
@Index(['recipientAdminId', 'createdAt'])
@Index(['recipientAdminId', 'isRead'])
export class AdminNotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'recipient_admin_id', type: 'uuid' })
  recipientAdminId: string;

  @Column({ name: 'event_type', length: 60 })
  eventType: string;

  /** UI category for icon/grouping (e.g. `order`). */
  @Column({ length: 40 })
  type: string;

  @Column({ length: 160 })
  title: string;

  @Column({ length: 255, type: 'varchar', nullable: true })
  body: string | null;

  /** Admin deep-link target (e.g. `/admin/orders/SO-100245`). */
  @Column({ length: 255, type: 'varchar', nullable: true })
  link: string | null;

  /** Structured payload for the client (order_no, grand_total, item_count, …). */
  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, unknown> | null;

  @Column({ name: 'related_entity_type', length: 60, type: 'varchar', nullable: true })
  relatedEntityType: string | null;

  @Column({ name: 'related_entity_id', type: 'uuid', nullable: true })
  relatedEntityId: string | null;

  @Column({ name: 'is_read', default: false })
  isRead: boolean;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  /**
   * Dedupe key (`order.placed:<order_id>`). Partial-unique with `recipient_admin_id` so a re-fired
   * trigger does not duplicate an admin's feed row (FR-NOTIF-076; §12 edge case 17).
   */
  @Column({ name: 'idempotency_key', length: 140, type: 'varchar', nullable: true })
  idempotencyKey: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
