import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { MessageChannel, MessageDirection } from '../leads.enums';
import { LeadEntity } from './lead.entity';

/**
 * LeadMessage (SRS 08 §8) — one entry in a lead's conversation thread. `inbound` = submitter/customer,
 * `outbound` = admin reply (with a delivery `channel`). `is_internal_note` rows are admin-only and are
 * never returned to the customer (BR-LEAD-7). Internal notes / outbound replies are written by the admin
 * inbox (lead-inbox-be); lead-core writes the original inbound message + customer follow-up replies.
 */
@Entity('lead_messages')
@Index(['leadId'])
export class LeadMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lead_id', type: 'uuid' })
  leadId: string;

  @Column({ type: 'enum', enum: MessageDirection })
  direction: MessageDirection;

  @Column({ name: 'author_admin_id', type: 'uuid', nullable: true })
  authorAdminId: string | null;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'enum', enum: MessageChannel, nullable: true })
  channel: MessageChannel | null;

  @Column({ name: 'is_internal_note', type: 'boolean', default: false })
  isInternalNote: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => LeadEntity, (lead) => lead.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead: LeadEntity;
}
