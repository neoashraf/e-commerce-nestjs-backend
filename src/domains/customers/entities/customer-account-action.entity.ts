import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { CustomerAccountActionType } from '../customers.enums';

/**
 * CustomerAccountAction (SRS 12 §8) — an append-only log of suspend/reactivate actions taken on a
 * customer (FR-CUST-020/021/023, BR-CUST-6). Mirrors the RBAC audit entry but is queryable per-customer.
 */
@Entity('customer_account_actions')
@Index(['customerId'])
export class CustomerAccountActionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'admin_id', type: 'uuid' })
  adminId: string;

  @Column({ type: 'enum', enum: CustomerAccountActionType, enumName: 'customer_account_action_enum' })
  action: CustomerAccountActionType;

  @Column({ type: 'varchar', length: 160, nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
