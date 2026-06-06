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
 * ORM mapping for `coupons` (SRS 14 §8 Coupon). `code` is stored normalized uppercase and is
 * case-insensitively unique (BR-PROMO-1). Money is Decimal(12,2). Eligibility scope carries category/
 * product id arrays. `total_used` is the running redemption count the engine increments. Soft-delete.
 */
@Entity('coupons')
export class CouponOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 40 })
  code: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  description: string | null;

  @Column({ name: 'discount_type', length: 16 })
  discountType: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  value: string;

  @Column({ name: 'max_discount_amount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  maxDiscountAmount: string | null;

  @Column({ name: 'min_order_subtotal', type: 'decimal', precision: 12, scale: 2, nullable: true })
  minOrderSubtotal: string | null;

  @Column({ name: 'eligibility_scope', length: 16, default: 'all' })
  eligibilityScope: string;

  @Column({ name: 'eligible_category_ids', type: 'uuid', array: true, default: () => "'{}'" })
  eligibleCategoryIds: string[];

  @Column({ name: 'eligible_product_ids', type: 'uuid', array: true, default: () => "'{}'" })
  eligibleProductIds: string[];

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt: Date;

  @Column({ name: 'total_usage_limit', type: 'int', nullable: true })
  totalUsageLimit: number | null;

  @Column({ name: 'per_customer_limit', type: 'int', nullable: true })
  perCustomerLimit: number | null;

  @Column({ name: 'first_order_only', default: false })
  firstOrderOnly: boolean;

  @Column({ name: 'total_used', type: 'int', default: 0 })
  totalUsed: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
