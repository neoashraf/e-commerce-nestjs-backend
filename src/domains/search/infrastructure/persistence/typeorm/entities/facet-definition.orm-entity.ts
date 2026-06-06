import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * ORM mapping for `facet_definition` (SRS 03 §8 FacetDefinition) — admin-configured filterable
 * dimension. `source = attribute` maps `source_attribute_key → CAT Attribute.code`; `variant_color`/
 * `variant_size`/`brand`/`category`/`price`/`availability` are convenience sources. `key` is unique.
 */
@Entity('facet_definition')
export class FacetDefinitionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 60 })
  key: string;

  @Column({ length: 80 })
  label: string;

  @Column({ length: 16 })
  type: string;

  @Column({ length: 24 })
  source: string;

  @Column({ name: 'source_attribute_key', length: 60, nullable: true })
  sourceAttributeKey: string | null;

  @Column({ name: 'is_multi_select', default: true })
  isMultiSelect: boolean;

  @Column({ name: 'hide_zero_counts', default: true })
  hideZeroCounts: boolean;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
