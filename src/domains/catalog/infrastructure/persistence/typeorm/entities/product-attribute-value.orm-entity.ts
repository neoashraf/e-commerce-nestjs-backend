import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * ORM mapping for `product_attribute_values` (SRS 02 §8 ProductAttributeValue) — the typed-column
 * EAV store. Exactly one value column (or `option_id`) is populated per row, per the attribute's
 * type; multiselect persists one row per selected option. Unique on (product_id, attribute_id,
 * option_id). `SRCH` reads filterable attributes + these values to build facets (FR-CAT-048/054).
 */
@Entity('product_attribute_values')
@Index(['productId'])
@Index(['attributeId'])
export class ProductAttributeValueOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ name: 'attribute_id', type: 'uuid' })
  attributeId: string;

  @Column({ name: 'option_id', type: 'uuid', nullable: true })
  optionId: string | null;

  @Column({ name: 'value_text', type: 'text', nullable: true })
  valueText: string | null;

  @Column({ name: 'value_decimal', type: 'decimal', precision: 14, scale: 4, nullable: true })
  valueDecimal: string | null;

  @Column({ name: 'value_boolean', type: 'boolean', nullable: true })
  valueBoolean: boolean | null;

  @Column({ name: 'value_datetime', type: 'timestamptz', nullable: true })
  valueDatetime: Date | null;
}
