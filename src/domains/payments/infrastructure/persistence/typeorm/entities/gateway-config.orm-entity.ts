import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { GatewayEnvironment, PaymentMethod } from '../../../../domain/payment-enums';

/**
 * ORM mapping for `gateway_config` (SRS 05 §8 GatewayConfig) — per-method enable flag + environment +
 * a secret **reference** (never the raw credentials, BR-PAY-7). A disabled method rejects initiation
 * (FR-PAY-061). `GET /admin/payment-settings` returns the ref + flags, never secrets.
 */
@Entity('gateway_config')
export class GatewayConfigOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'enum', enum: PaymentMethod })
  method: PaymentMethod;

  @Column({ type: 'enum', enum: GatewayEnvironment, default: GatewayEnvironment.SANDBOX })
  environment: GatewayEnvironment;

  @Column({ name: 'credentials_ref', type: 'text', nullable: true })
  credentialsRef: string | null;

  @Column({ name: 'is_enabled', default: false })
  isEnabled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
