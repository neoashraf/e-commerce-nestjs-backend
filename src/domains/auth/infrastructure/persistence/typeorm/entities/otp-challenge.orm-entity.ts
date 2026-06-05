import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('otp_challenges')
@Index(['phone'])
export class OtpChallengeOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ length: 16 })
  phone: string;

  @Column({ name: 'otp_hash', length: 255 })
  otpHash: string;

  @Column({ type: 'varchar', length: 20 })
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
