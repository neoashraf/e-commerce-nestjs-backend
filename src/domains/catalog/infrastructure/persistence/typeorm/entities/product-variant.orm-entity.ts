import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * ORM mapping for `product_variants` (SRS 02 §8 ProductVariant) — a sellable SKU. `id` is the stable
 * `variant_id` consumed by `INV`/`CART`/`ORD` and must NEVER change once generated. `sku_code` is
 * globally unique (across soft-deleted too); `price_override`/`image_id` nullable; `is_enabled`
 * gates sellability; soft-delete via `deleted_at`.
 */
@Entity('product_variants')
@Index(['productId'])
export class ProductVariantOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Index({ unique: true })
  @Column({ name: 'sku_code', length: 64 })
  skuCode: string;

  @Column({ name: 'price_override', type: 'decimal', precision: 12, scale: 2, nullable: true })
  priceOverride: string | null;

  @Column({ name: 'image_id', type: 'uuid', nullable: true })
  imageId: string | null;

  @Column({ name: 'is_enabled', default: true })
  isEnabled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
