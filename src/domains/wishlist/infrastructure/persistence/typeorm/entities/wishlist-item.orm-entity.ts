import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * WISH `wishlist_items` (SRS 07 §8): a reference to a CAT product + optional preferred variant. Stores
 * references ONLY — price/availability are read live from CAT/INV at view time (BR-WISH-2), never cached
 * here. Unique on `(wishlist_id, product_id, preferred_variant_id)` (nulls distinct, §12.7 — the same
 * product with two preferred sizes = two items); `added_at` drives most-recent-first order (FR-WISH-013).
 */
@Entity('wishlist_items')
@Index(['wishlistId'])
@Index('uq_wishlist_item', ['wishlistId', 'productId', 'preferredVariantId'], { unique: true })
export class WishlistItemOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'wishlist_id', type: 'uuid' })
  wishlistId: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ name: 'preferred_variant_id', type: 'uuid', nullable: true })
  preferredVariantId: string | null;

  @CreateDateColumn({ name: 'added_at', type: 'timestamptz' })
  addedAt: Date;
}
