import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * ORM mapping for `product_categories` (SRS 02 §8) — the additional browsing categories for a
 * product (BR-CAT-2); the canonical category is `Product.primary_category_id`. Unique on
 * (product_id, category_id).
 */
@Entity('product_categories')
@Index(['productId'])
@Index(['productId', 'categoryId'], { unique: true })
export class ProductCategoryOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;
}
