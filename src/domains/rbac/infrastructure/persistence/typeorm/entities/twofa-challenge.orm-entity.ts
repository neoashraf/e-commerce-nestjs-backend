import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Transient pending 2FA challenge (support state for the FR-RBAC-002 verify flow). */
@Entity('admin_twofa_challenges')
export class TwofaChallengeOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'admin_user_id', type: 'uuid' })
  adminUserId: string;

  @Column({ name: 'otp_hash', length: 255 })
  otpHash: string;

  @Column({ type: 'varchar', length: 10 })
  channel: string;

  @Column({ name: 'remember_device', default: false })
  rememberDevice: boolean;

  /** login | enable | disable (FR-RBAC-002/008/009 purpose binding). */
  @Column({ type: 'varchar', length: 10, default: 'login' })
  purpose: string;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
