import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import {
  PaymentLogEvent,
  PaymentLogResult,
  PaymentMethod,
} from '../../../../domain/payment-enums';

/**
 * ORM mapping for `payment_transaction_log` (SRS 05 §8 PaymentTransactionLog) — the append-only
 * reconciliation log written on every gateway interaction (initiate/create/callback/ipn/execute/
 * query/validate/refund) (BR-PAY-8, FR-PAY-043). `gateway_reference` backs idempotency (BR-PAY-4).
 * `request_summary`/`response_summary` carry **non-sensitive** data only — no card/wallet data.
 * Insert-only: never updated or deleted.
 */
@Entity('payment_transaction_log')
@Index(['paymentId'])
@Index(['gatewayReference'])
export class PaymentTransactionLogOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'payment_id', type: 'uuid', nullable: true })
  paymentId: string | null;

  @Column({ type: 'enum', enum: PaymentMethod })
  method: PaymentMethod;

  @Column({ type: 'enum', enum: PaymentLogEvent })
  event: PaymentLogEvent;

  @Column({ type: 'varchar', name: 'gateway_reference', length: 120, nullable: true })
  gatewayReference: string | null;

  @Column({ name: 'request_summary', type: 'jsonb', default: () => "'{}'" })
  requestSummary: Record<string, unknown>;

  @Column({ name: 'response_summary', type: 'jsonb', default: () => "'{}'" })
  responseSummary: Record<string, unknown>;

  @Column({ type: 'enum', enum: PaymentLogResult })
  result: PaymentLogResult;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
