import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * ORM mapping for `product_images` (SRS 02 §8 ProductImage, FR-CAT-030/031/032/033). `renditions`
 * is a JSON map `{ thumb, listing, detail }` (filled by async rendition generation, original-URL
 * fallback until ready); `alt_text` is required. Exactly one image per product is the primary
 * (mirrored to `Product.primary_image_id`).
 */
@Entity('product_images')
@Index(['productId'])
export class ProductImageOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  @Column({ type: 'jsonb', nullable: true })
  renditions: Record<string, string> | null;

  @Column({ name: 'alt_text', length: 160 })
  altText: string;

  @Column({ name: 'color_option_id', type: 'uuid', nullable: true })
  colorOptionId: string | null;

  @Column({ name: 'is_primary', default: false })
  isPrimary: boolean;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
