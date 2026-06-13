import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * ORM mapping for `category_size_guides` (RW6) — one optional footwear size chart per category.
 * A product's PDP `size_guide` resolves to the **nearest** ancestor category that has a row (a child
 * category inherits its parent's chart). UK size ↔ foot-length only; the rows are real client data
 * (seeded as a clearly-labelled placeholder until confirmed). PK = category_id (one chart per category).
 */
@Entity('category_size_guides')
export class CategorySizeGuideOrmEntity {
  @PrimaryColumn({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  /** Helper copy shown above the table (e.g. "Measure your foot heel-to-toe…"). */
  @Column({ name: 'measure_note', type: 'text' })
  measureNote: string;

  /** Foot-length unit for the table header (e.g. "cm"). */
  @Column({ type: 'varchar', length: 8, default: 'cm' })
  unit: string;

  /** Ordered chart rows: { uk, foot } string pairs (jsonb). */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  rows: { uk: string; foot: string }[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
