import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('mfa_settings')
export class MfaSettingsOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'sms_enabled', default: false })
  smsEnabled: boolean;

  @Column({ name: 'email_enabled', default: true })
  emailEnabled: boolean;

  @Column({ name: 'enforcement_mode', type: 'varchar', length: 20, default: 'optional' })
  enforcementMode: string;

  @Column({ name: 'otp_ttl_seconds', type: 'int', default: 300 })
  otpTtlSeconds: number;

  @Column({ name: 'resend_cooldown_seconds', type: 'int', default: 60 })
  resendCooldownSeconds: number;

  @Column({ name: 'max_attempts', type: 'int', default: 5 })
  maxAttempts: number;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
