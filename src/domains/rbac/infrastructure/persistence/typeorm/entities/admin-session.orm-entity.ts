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

  @Column({ name: 'device_label', type: 'varchar', length: 120, nullable: true })
  deviceLabel: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
