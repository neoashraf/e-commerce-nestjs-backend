import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * WISH `wishlists` (SRS 07 §8): a single server-persisted wishlist per customer (BR-WISH-1) — one row
 * per `customer_id` (unique). Items hang off it via `wishlist_items`. Created lazily on first add/merge.
 */
@Entity('wishlists')
export class WishlistOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
