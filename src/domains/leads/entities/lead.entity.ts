import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { LeadSource, LeadStatus, LeadType } from '../leads.enums';
import { LeadMessageEntity } from './lead-message.entity';
import { LeadAttachmentEntity } from './lead-attachment.entity';

/**
 * Lead (SRS 08 §8). A single inbound enquiry with a human-readable `reference` (HLP-…), submitter
 * contact, type/status, and optional links to a customer/order/product for context (BR-LEAD-2).
 *
 * Deviation note: the SRS §8 model lists only `order_id` (UUID FK), but the API contract uses the
 * human-readable `order_reference` (order number) on submit and in the thread. We persist BOTH:
 * `order_reference` retains what the submitter typed; `order_id` is set only once the ORD port resolves
 * the reference AND it matches the submitter (a mismatch is retained-but-unlinked, not hard-failed — §12.2).
 */
@Entity('leads')
@Index(['customerId'])
@Index(['status'])
@Index(['type'])
export class LeadEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 20, unique: true })
  reference: string;

  @Column({ type: 'enum', enum: LeadType })
  type: LeadType;

  @Column({ length: 160 })
  subject: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ name: 'submitter_name', length: 120 })
  submitterName: string;

  @Column({ name: 'submitter_phone', length: 16 })
  submitterPhone: string;

  @Column({ name: 'submitter_email', type: 'varchar', length: 160, nullable: true })
  submitterEmail: string | null;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId: string | null;

  @Column({ name: 'order_reference', type: 'varchar', length: 40, nullable: true })
  orderReference: string | null;

  @Column({ name: 'product_id', type: 'uuid', nullable: true })
  productId: string | null;

  @Column({ type: 'enum', enum: LeadStatus, default: LeadStatus.NEW })
  status: LeadStatus;

  @Column({ name: 'assigned_admin_id', type: 'uuid', nullable: true })
  assignedAdminId: string | null;

  @Column({ type: 'enum', enum: LeadSource, default: LeadSource.GET_HELP })
  source: LeadSource;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => LeadMessageEntity, (m) => m.lead)
  messages: LeadMessageEntity[];

  @OneToMany(() => LeadAttachmentEntity, (a) => a.lead)
  attachments: LeadAttachmentEntity[];
}
