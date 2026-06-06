import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * ORM mapping for `coupon_redemptions` (SRS 14 §8 CouponRedemption) — the append-only redemption ledger
 * written by the engine (promo-engine-be) and read by the admin usage view. Retained even when a coupon
 * is soft-deleted. `status` flips to `reversed` on order cancellation.
 */
@Entity('coupon_redemptions')
@Index(['couponId'])
@Index(['orderId'])
export class CouponRedemptionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'coupon_id', type: 'uuid' })
  couponId: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @Column({ type: 'varchar', name: 'guest_phone', length: 16, nullable: true })
  guestPhone: string | null;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 12, scale: 2 })
  discountAmount: string;

  @Column({ length: 16, default: 'applied' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'reversed_at', type: 'timestamptz', nullable: true })
  reversedAt: Date | null;
}
