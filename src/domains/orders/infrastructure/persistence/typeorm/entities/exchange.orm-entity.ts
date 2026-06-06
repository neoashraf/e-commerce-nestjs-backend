import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  ExchangeReason,
  ExchangeStatus,
  ReturnedItemDisposition,
} from '../../../../domain/exchange-enums';
import { ExchangeAttachmentOrmEntity } from './exchange-attachment.orm-entity';
import { OrderItemOrmEntity } from './order-item.orm-entity';
import { OrderOrmEntity } from './order.orm-entity';

/**
 * ORM mapping for `exchanges` (SRS 06 §8 Exchange). A post-delivery exchange request for one delivered
 * `order_item`: reason + optional evidence, the QA/approval lifecycle, the chosen equal/higher-value
 * replacement variant, any price difference (≥ 0 — never negative, no cash back, BR-ORD-8), the linked
 * replacement order, and the returned-item disposition. Money is Decimal(12,2).
 */
@Entity('exchanges')
@Index(['orderId'])
@Index(['status'])
export class ExchangeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @ManyToOne(() => OrderOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: OrderOrmEntity;

  @Column({ name: 'order_item_id', type: 'uuid' })
  orderItemId: string;

  @ManyToOne(() => OrderItemOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_item_id' })
  orderItem: OrderItemOrmEntity;

  @Column({ type: 'enum', enum: ExchangeReason })
  reason: ExchangeReason;

  @Column({ name: 'customer_note', type: 'text', nullable: true })
  customerNote: string | null;

  @Column({ type: 'enum', enum: ExchangeStatus, default: ExchangeStatus.REQUESTED })
  status: ExchangeStatus;

  @Column({ name: 'rejection_reason', type: 'varchar', length: 160, nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'replacement_variant_id', type: 'uuid', nullable: true })
  replacementVariantId: string | null;

  @Column({ name: 'replacement_order_id', type: 'uuid', nullable: true })
  replacementOrderId: string | null;

  @Column({ name: 'price_difference', type: 'decimal', precision: 12, scale: 2, default: 0 })
  priceDifference: string;

  @Column({ name: 'difference_payment_id', type: 'uuid', nullable: true })
  differencePaymentId: string | null;

  @Column({
    name: 'returned_item_disposition',
    type: 'enum',
    enum: ReturnedItemDisposition,
    nullable: true,
  })
  returnedItemDisposition: ReturnedItemDisposition | null;

  @Column({ name: 'reviewed_by_admin_id', type: 'uuid', nullable: true })
  reviewedByAdminId: string | null;

  @Column({ name: 'qa_due_at', type: 'timestamptz', nullable: true })
  qaDueAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => ExchangeAttachmentOrmEntity, (attachment) => attachment.exchange)
  attachments: ExchangeAttachmentOrmEntity[];
}
