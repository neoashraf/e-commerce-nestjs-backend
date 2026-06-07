import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * ORM mapping for `product_configurable_attributes` (SRS 02 §8) — which attributes a configurable
 * product varies on (each `is_configurable` + `select`, FR-CAT-020/BR-CAT-11). `position` is the
 * axis order in the editor. Unique on (product_id, attribute_id).
 */
@Entity('product_configurable_attributes')
@Index(['productId'])
@Index(['productId', 'attributeId'], { unique: true })
export class ProductConfigurableAttributeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ name: 'attribute_id', type: 'uuid' })
  attributeId: string;

  @Column({ type: 'int', default: 0 })
  position: number;
}
