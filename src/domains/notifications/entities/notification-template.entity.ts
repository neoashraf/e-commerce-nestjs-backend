import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('notification_templates')
@Index(['eventType', 'channel', 'locale'])
export class NotificationTemplateEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'event_type', length: 60 })
  eventType: string;

  @Column({ length: 10 })
  channel: string;

  @Column({ length: 10 })
  locale: string;

  @Column({ length: 255, type: 'varchar', nullable: true })
  subject: string | null;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
