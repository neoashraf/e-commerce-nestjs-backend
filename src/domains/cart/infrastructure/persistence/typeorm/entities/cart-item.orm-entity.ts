import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { CartOrmEntity } from './cart.orm-entity';

/**
 * ORM mapping for `cart_items` (SRS 04 §8 CartItem). One line per (cart, variant) — adds increment the
 * quantity (unique index in the migration). References CAT product/variant by id; **no price column**
 * (prices read live from CAT, snapshot only at placement — SRS §8 note).
 */
@Entity('cart_items')
@Index(['cartId'])
@Index(['cartId', 'variantId'], { unique: true })
export class CartItemOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cart_id', type: 'uuid' })
  cartId: string;

  @ManyToOne(() => CartOrmEntity, (cart) => cart.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cart_id' })
  cart: CartOrmEntity;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ name: 'variant_id', type: 'uuid' })
  variantId: string;

  @Column({ type: 'int' })
  quantity: number;

  @CreateDateColumn({ name: 'added_at' })
  addedAt: Date;
}
