import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** ORM mapping for `search_synonym` (SRS 03 §8 SearchSynonym) — interchangeable query terms (FR-SRCH-011). */
@Entity('search_synonym')
export class SearchSynonymOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Mutually interchangeable terms, e.g. ["boots","cleats"] (≥2, validated in the service). */
  @Column({ type: 'text', array: true })
  terms: string[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
