import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('customer_mfa')
export class CustomerMfaOrmEntity {
  /** 1:1 with a customer — the customer id is the primary key. */
  @PrimaryColumn({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ default: false })
  enabled: boolean;

  @Column({ name: 'preferred_channel', type: 'varchar', length: 10, nullable: true })
  preferredChannel: string | null;

  @Column({ name: 'enabled_at', type: 'timestamptz', nullable: true })
  enabledAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
