import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { RefundStatus, RefundType } from '../../../../domain/payment-enums';

/**
 * ORM mapping for `refunds` (SRS 05 §8 Refund). A refund exists only for a prepaid cancellation or a
 * duplicate/erroneous capture (BR-PAY-6) — never for post-delivery returns (those are exchanges in ORD).
 * Cumulative refunds never exceed the captured amount. Created/processed by pay-refunds-be.
 */
@Entity('refunds')
@Index(['paymentId'])
export class RefundOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: string;

  @Column({ length: 160 })
  reason: string;

  @Column({ type: 'enum', enum: RefundType, default: RefundType.GATEWAY })
  type: RefundType;

  @Column({ type: 'varchar', name: 'gateway_refund_ref', length: 120, nullable: true })
  gatewayRefundRef: string | null;

  @Column({ type: 'enum', enum: RefundStatus, default: RefundStatus.PENDING })
  status: RefundStatus;

  @Column({ name: 'requested_by_admin_id', type: 'uuid', nullable: true })
  requestedByAdminId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
