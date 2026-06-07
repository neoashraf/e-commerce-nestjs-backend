import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('channel_provider_config')
export class ChannelProviderConfigEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ length: 10 })
  channel: string;

  @Column({ name: 'provider_name', length: 60, type: 'varchar', nullable: true })
  providerName: string | null;

  @Column({ name: 'non_masking_sender', length: 40, type: 'varchar', nullable: true })
  nonMaskingSender: string | null;

  @Column({ name: 'masked_sender_id', length: 20, type: 'varchar', nullable: true })
  maskedSenderId: string | null;

  @Column({ name: 'transactional_from', length: 160, type: 'varchar', nullable: true })
  transactionalFrom: string | null;

  @Column({ name: 'credentials_ref', length: 200, type: 'varchar', nullable: true })
  credentialsRef: string | null;

  @Column({ name: 'quiet_hours_start', length: 5, type: 'varchar', nullable: true })
  quietHoursStart: string | null;

  @Column({ name: 'quiet_hours_end', length: 5, type: 'varchar', nullable: true })
  quietHoursEnd: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
