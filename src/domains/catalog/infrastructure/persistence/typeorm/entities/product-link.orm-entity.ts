import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * ORM mapping for `product_links` (SRS 02 §8 ProductLink, FR-CAT-019): typed merchandising links
 * between products (`related` | `up_sell` | `cross_sell`). Unique on (product_id, linked_product_id,
 * type) — a target appears at most once per link type. `position` preserves the curated order.
 */
@Entity('product_links')
@Index(['productId'])
@Index(['productId', 'linkedProductId', 'type'], { unique: true })
export class ProductLinkOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ name: 'linked_product_id', type: 'uuid' })
  linkedProductId: string;

  @Column({ length: 16 })
  type: string;

  @Column({ type: 'int', default: 0 })
  position: number;
}
