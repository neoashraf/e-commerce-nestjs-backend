import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { CartStatus } from '../../../../domain/enums/cart-status.enum';
import { CartItemOrmEntity } from './cart-item.orm-entity';

/**
 * ORM mapping for `carts` (SRS 04 §8 Cart). Owned by a customer (persisted, cross-device) or a guest
 * (opaque `cart_token`). At most one `active` cart per customer (partial unique index in the migration).
 * `applied_coupon_code` is a column only here — the coupon slice wires it. No money/price columns: line
 * prices read live from CAT and the subtotal recomputes on every view (BR-CART-1).
 */
@Entity('carts')
@Index(['customerId'])
export class CartOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @Index({ unique: true })
  @Column({ name: 'cart_token', length: 64, nullable: true })
  cartToken: string | null;

  @Column({ name: 'applied_coupon_code', length: 40, nullable: true })
  appliedCouponCode: string | null;

  @Column({ type: 'enum', enum: CartStatus, default: CartStatus.ACTIVE })
  status: CartStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => CartItemOrmEntity, (item) => item.cart, { cascade: true })
  items: CartItemOrmEntity[];
}
