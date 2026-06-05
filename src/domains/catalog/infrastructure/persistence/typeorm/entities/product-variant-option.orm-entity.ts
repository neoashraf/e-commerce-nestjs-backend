import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * ORM mapping for `product_variant_options` (SRS 02 §8) — one row per configurable attribute of a
 * variant; the set of rows for a variant is its coordinate in the matrix. Unique on
 * (variant_id, attribute_id).
 */
@Entity('product_variant_options')
@Index(['variantId'])
@Index(['variantId', 'attributeId'], { unique: true })
export class ProductVariantOptionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'variant_id', type: 'uuid' })
  variantId: string;

  @Column({ name: 'attribute_id', type: 'uuid' })
  attributeId: string;

  @Column({ name: 'option_id', type: 'uuid' })
  optionId: string;
}
