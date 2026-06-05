import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/** Single-use admin password-reset token (support state for FR-RBAC-007). Only the hash is stored. */
@Entity('admin_password_reset_tokens')
@Index(['adminUserId'])
export class PasswordResetTokenOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'admin_user_id', type: 'uuid' })
  adminUserId: string;

  @Index({ unique: true })
  @Column({ name: 'token_hash', length: 255 })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
