import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * ORM mapping for `checkout_sessions` (SRS 04 §8 CheckoutSession) — binds a quote to a placement and
 * backs the idempotency replay (FR-CART-036, BR-CART-7). `idempotency_key` is unique (one order per
 * key); `placed_order_id`/`placed_order_no` record the created order so a replay returns it unchanged.
 */
@Entity('checkout_sessions')
export class CheckoutSessionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cart_id', type: 'uuid', nullable: true })
  cartId: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', name: 'idempotency_key', length: 120, nullable: true })
  idempotencyKey: string | null;

  @Column({ name: 'placed_order_id', type: 'uuid', nullable: true })
  placedOrderId: string | null;

  @Column({ type: 'varchar', name: 'placed_order_no', length: 20, nullable: true })
  placedOrderNo: string | null;

  @Column({ type: 'varchar', name: 'order_status', length: 32, nullable: true })
  orderStatus: string | null;

  @Column({ type: 'varchar', name: 'payment_action', length: 16, nullable: true })
  paymentAction: string | null;

  @Column({ name: 'payment_redirect_url', type: 'text', nullable: true })
  paymentRedirectUrl: string | null;

  @Column({ type: 'varchar', name: 'payment_status', length: 32, nullable: true })
  paymentStatus: string | null;

  @Column({ name: 'grand_total', type: 'decimal', precision: 12, scale: 2, nullable: true })
  grandTotal: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
