import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('sessions')
@Index(['customerId'])
@Index(['refreshTokenHash'])
export class SessionOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'refresh_token_hash', length: 255 })
  refreshTokenHash: string;

  @Column({ name: 'device_label', length: 120, type: 'varchar', nullable: true })
  deviceLabel: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  /** When the session's login lineage last verified a phone OTP (FR-AUTH-037). */
  @Column({ name: 'otp_verified_at', type: 'timestamptz', nullable: true })
  otpVerifiedAt: Date | null;

  /** True when created through a completed second factor (FR-MFA-018). */
  @Column({ name: 'mfa_verified', default: false })
  mfaVerified: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
