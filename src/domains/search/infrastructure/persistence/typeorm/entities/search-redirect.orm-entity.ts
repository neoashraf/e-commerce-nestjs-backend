import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * ORM mapping for `search_redirect` (SRS 03 §8 SearchRedirect) — admin query→target rule (FR-SRCH-013).
 * `query_pattern` is the normalized query to match; uniqueness among active rules is enforced in the
 * service (a partial unique index would also work but active toggling makes the service check clearer).
 */
@Entity('search_redirect')
@Index(['queryPattern'])
export class SearchRedirectOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'query_pattern', length: 120 })
  queryPattern: string;

  @Column({ name: 'target_type', length: 16 })
  targetType: string;

  @Column({ name: 'target_ref', length: 255 })
  targetRef: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
