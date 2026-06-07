import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('notifications')
@Index(['idempotencyKey'])
@Index(['providerMessageRef'])
export class NotificationEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'event_type', length: 60 })
  eventType: string;

  @Column({ length: 20 })
  category: string;

  @Column({ length: 10 })
  channel: string;

  @Column({ length: 10, default: 'en' })
  locale: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @Column({ name: 'admin_user_id', type: 'uuid', nullable: true })
  adminUserId: string | null;

  @Column({ name: 'recipient_address', length: 200 })
  recipientAddress: string;

  @Column({ name: 'related_entity_type', length: 40, type: 'varchar', nullable: true })
  relatedEntityType: string | null;

  @Column({ name: 'related_entity_id', type: 'uuid', nullable: true })
  relatedEntityId: string | null;

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  templateId: string | null;

  @Column({ name: 'template_version', type: 'int', nullable: true })
  templateVersion: number | null;

  @Column({ name: 'rendered_subject', length: 255, type: 'varchar', nullable: true })
  renderedSubject: string | null;

  @Column({ name: 'rendered_body', type: 'text' })
  renderedBody: string;

  @Column({ name: 'sms_segments', type: 'int', nullable: true })
  smsSegments: number | null;

  @Column({ name: 'sms_sender_route', length: 20, type: 'varchar', nullable: true })
  smsSenderRoute: string | null;

  @Column({ name: 'provider_message_ref', length: 120, type: 'varchar', nullable: true })
  providerMessageRef: string | null;

  @Column({ length: 20, default: 'queued' })
  status: string;

  @Column({ name: 'failure_reason', length: 160, type: 'varchar', nullable: true })
  failureReason: string | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'idempotency_key', length: 160, type: 'varchar', nullable: true })
  idempotencyKey: string | null;

  @Column({ name: 'resent_from_id', type: 'uuid', nullable: true })
  resentFromId: string | null;

  @Column({ name: 'deferred_until', type: 'timestamptz', nullable: true })
  deferredUntil: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
