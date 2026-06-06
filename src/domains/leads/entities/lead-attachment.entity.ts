import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { LeadEntity } from './lead.entity';

/**
 * LeadAttachment (SRS 08 §8) — claim/return evidence (image/video, ≤10MB, ≤5 per lead — BR-LEAD-6).
 * Uploaded ahead of submission (`POST /leads/attachments` returns an id), so `lead_id` is null until the
 * attachment is referenced by a `claim_return` submission and bound to its lead.
 */
@Entity('lead_attachments')
@Index(['leadId'])
export class LeadAttachmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lead_id', type: 'uuid', nullable: true })
  leadId: string | null;

  @Column({ type: 'text' })
  url: string;

  @Column({ name: 'content_type', length: 80 })
  contentType: string;

  @Column({ name: 'size_bytes', type: 'integer' })
  sizeBytes: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => LeadEntity, (lead) => lead.attachments, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'lead_id' })
  lead: LeadEntity | null;
}
