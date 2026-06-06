import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  PaymentMethod,
  PaymentPurpose,
  PaymentStatus,
} from '../../../../domain/payment-enums';

/**
 * ORM mapping for `payments` (SRS 05 §8 Payment). One active payment per (order, purpose) (BR-PAY-1).
 * Holds only gateway references + non-sensitive metadata — never card/wallet/PAN data (BR-PAY-7).
 * Money is Decimal(12,2), currency BDT. `internal_ref` is the unique merchant reference.
 */
@Entity('payments')
@Index(['orderId'])
@Index(['status'])
export class PaymentOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @Column({ type: 'enum', enum: PaymentPurpose, default: PaymentPurpose.ORDER })
  purpose: PaymentPurpose;

  @Column({ name: 'exchange_id', type: 'uuid', nullable: true })
  exchangeId: string | null;

  @Column({ type: 'enum', enum: PaymentMethod })
  method: PaymentMethod;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: string;

  @Column({ length: 3, default: 'BDT' })
  currency: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Index({ unique: true })
  @Column({ name: 'internal_ref', length: 40, unique: true })
  internalRef: string;

  @Column({ name: 'gateway_payment_id', length: 120, nullable: true })
  gatewayPaymentId: string | null;

  @Column({ name: 'gateway_txn_id', length: 120, nullable: true })
  gatewayTxnId: string | null;

  @Column({ name: 'collected_by_admin_id', type: 'uuid', nullable: true })
  collectedByAdminId: string | null;

  @Column({ name: 'collected_at', type: 'timestamptz', nullable: true })
  collectedAt: Date | null;

  @Column({ name: 'refunded_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  refundedAmount: string;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
