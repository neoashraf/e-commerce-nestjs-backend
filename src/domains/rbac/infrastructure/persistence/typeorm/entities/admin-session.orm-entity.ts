import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('admin_sessions')
@Index(['adminUserId'])
export class AdminSessionOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'admin_user_id', type: 'uuid' })
  adminUserId: string;

  @Column({ name: 'refresh_token_hash', length: 255 })
  refreshTokenHash: string;

  @Column({ name: 'device_label', type: 'varchar', length: 255, nullable: true })
  deviceLabel: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  /** True when the login passed the 2FA step (mirrors FR-MFA-018). */
  @Column({ name: 'mfa_verified', default: false })
  mfaVerified: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
