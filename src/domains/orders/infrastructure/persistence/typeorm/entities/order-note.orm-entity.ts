import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * ORM mapping for `order_notes` (SRS 06 §5.9 FR-ORD-072) — internal, admin-only notes on an order.
 * Never surfaced on any customer-facing read; an append-only operational trail authored by admins.
 */
@Entity('order_notes')
@Index(['orderId'])
export class OrderNoteOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @Column({ type: 'text' })
  body: string;

  /** The admin who authored the note (null for system-authored notes). */
  @Column({ name: 'author_admin_id', type: 'uuid', nullable: true })
  authorAdminId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
