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
 * ORM mapping for `products` (SRS 02 §8 Product). snake_case columns; UUID PK; soft-delete.
 * `sku` and `slug` are globally unique (across soft-deleted rows too, to preserve URLs/SKUs).
 * `family_id` is immutable after creation (enforced in the service, FR-CAT-065). Stock is NEVER
 * stored here — it is read live from `INV` keyed by `variant_id` (BR-CAT-5).
 */
@Entity('products')
@Index(['status'])
@Index(['familyId'])
@Index(['primaryCategoryId'])
export class ProductOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 16, default: 'simple' })
  type: string;

  @Column({ name: 'family_id', type: 'uuid' })
  familyId: string;

  @Index({ unique: true })
  @Column({ length: 64 })
  sku: string;

  @Column({ length: 180 })
  name: string;

  /** Optional Bangla product name (RW6) — rendered under the Latin name on the storefront card. */
  @Column({ name: 'name_bn', type: 'varchar', length: 180, nullable: true })
  nameBn: string | null;

  @Index({ unique: true })
  @Column({ length: 200 })
  slug: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  brand: string | null;

  @Column({ name: 'short_description', type: 'text', nullable: true })
  shortDescription: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'base_price', type: 'decimal', precision: 12, scale: 2 })
  basePrice: string;

  @Column({ name: 'sale_price', type: 'decimal', precision: 12, scale: 2, nullable: true })
  salePrice: string | null;

  @Column({ name: 'sale_starts_at', type: 'timestamptz', nullable: true })
  saleStartsAt: Date | null;

  @Column({ name: 'sale_ends_at', type: 'timestamptz', nullable: true })
  saleEndsAt: Date | null;

  @Column({ length: 16, default: 'draft' })
  status: string;

  @Column({ name: 'is_featured', default: false })
  isFeatured: boolean;

  @Column({ name: 'is_new', default: false })
  isNew: boolean;

  @Column({ type: 'decimal', precision: 8, scale: 3, nullable: true })
  weight: string | null;

  @Column({ name: 'primary_category_id', type: 'uuid' })
  primaryCategoryId: string;

  @Column({ name: 'primary_image_id', type: 'uuid', nullable: true })
  primaryImageId: string | null;

  @Column({ type: 'varchar', name: 'meta_title', length: 160, nullable: true })
  metaTitle: string | null;

  @Column({ type: 'varchar', name: 'meta_keywords', length: 255, nullable: true })
  metaKeywords: string | null;

  @Column({ type: 'varchar', name: 'meta_description', length: 320, nullable: true })
  metaDescription: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
