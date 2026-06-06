import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * ORM mapping for `search_query_log` (SRS 03 §8 SearchQueryLog) — one row per submitted search
 * (FR-SRCH-014), feeding popular/zero-result insights + RPT. Append-only (no update/delete path).
 */
@Entity('search_query_log')
@Index(['normalizedText'])
@Index(['hadResults'])
@Index(['createdAt'])
export class SearchQueryLogOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'query_text', length: 255 })
  queryText: string;

  @Column({ name: 'normalized_text', length: 255 })
  normalizedText: string;

  @Column({ name: 'result_count', type: 'int', default: 0 })
  resultCount: number;

  @Column({ name: 'had_results', default: false })
  hadResults: boolean;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
