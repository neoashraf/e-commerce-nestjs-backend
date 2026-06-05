import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('email_verification_tokens')
@Index(['customerId'])
export class EmailVerificationTokenOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'token_hash', length: 255 })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
