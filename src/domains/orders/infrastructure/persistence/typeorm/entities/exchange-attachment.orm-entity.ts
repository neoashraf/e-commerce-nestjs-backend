import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ExchangeOrmEntity } from './exchange.orm-entity';

/**
 * ORM mapping for `exchange_attachments` (SRS 06 §8 ExchangeAttachment) — photo/video evidence for an
 * exchange (required for `quality_defect`, FR-ORD-045). Attachments are uploaded first (orphaned) and
 * then linked to the exchange when the request is created, so `exchange_id` is nullable until linked.
 */
@Entity('exchange_attachments')
@Index(['exchangeId'])
export class ExchangeAttachmentOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'exchange_id', type: 'uuid', nullable: true })
  exchangeId: string | null;

  @ManyToOne(() => ExchangeOrmEntity, (exchange) => exchange.attachments, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'exchange_id' })
  exchange: ExchangeOrmEntity | null;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  @Column({ name: 'content_type', type: 'varchar', length: 80 })
  contentType: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
