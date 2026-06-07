import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  OrderActorType,
  OrderDeliveryZone,
  OrderPaymentMethod,
  OrderPaymentState,
  OrderStatus,
} from '../../../../domain/order-enums';
import { OrderItemOrmEntity } from './order-item.orm-entity';

/** Recipient + delivery address snapshot stored on the order (SRS 06 §8 Order.address_snapshot). */
export interface OrderAddressSnapshot {
  recipient_name: string;
  recipient_phone: string;
  address_line: string;
  area?: string | null;
  district?: string | null;
  division?: string | null;
  postal_code?: string | null;
}

/**
 * ORM mapping for `orders` (SRS 06 §8 Order). Immutable snapshot of line items, prices, address, and
 * amounts at placement (BR-ORD-1) — only status / payment_state / shipment / replacement link mutate
 * post-creation. `order_no` is a unique human-readable `SO-` number (BR-ORD-2). Money is Decimal(12,2).
 */
@Entity('orders')
@Index(['customerId'])
@Index(['status'])
@Index(['guestPhone'])
export class OrderOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'order_no', length: 20, unique: true })
  orderNo: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @Column({ type: 'varchar', name: 'guest_name', length: 120, nullable: true })
  guestName: string | null;

  @Column({ type: 'varchar', name: 'guest_phone', length: 16, nullable: true })
  guestPhone: string | null;

  @Column({ type: 'varchar', name: 'guest_email', length: 160, nullable: true })
  guestEmail: string | null;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING_PAYMENT })
  status: OrderStatus;

  @Column({ name: 'replacement_order_id', type: 'uuid', nullable: true })
  replacementOrderId: string | null;

  @Column({ name: 'payment_method', type: 'enum', enum: OrderPaymentMethod })
  paymentMethod: OrderPaymentMethod;

  @Column({
    name: 'payment_state',
    type: 'enum',
    enum: OrderPaymentState,
    default: OrderPaymentState.UNPAID,
  })
  paymentState: OrderPaymentState;

  @Column({ name: 'delivery_zone', type: 'enum', enum: OrderDeliveryZone })
  deliveryZone: OrderDeliveryZone;

  @Column({ name: 'address_snapshot', type: 'jsonb' })
  addressSnapshot: OrderAddressSnapshot;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: string;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  discountAmount: string;

  @Column({ type: 'varchar', name: 'applied_coupon_code', length: 40, nullable: true })
  appliedCouponCode: string | null;

  @Column({ name: 'delivery_charge', type: 'decimal', precision: 12, scale: 2, default: 0 })
  deliveryCharge: string;

  @Column({ name: 'cod_surcharge', type: 'decimal', precision: 12, scale: 2, default: 0 })
  codSurcharge: string;

  @Column({ name: 'vat_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  vatAmount: string;

  @Column({ name: 'grand_total', type: 'decimal', precision: 12, scale: 2 })
  grandTotal: string;

  @Column({ type: 'varchar', name: 'courier_name', length: 80, nullable: true })
  courierName: string | null;

  @Column({ type: 'varchar', name: 'tracking_number', length: 80, nullable: true })
  trackingNumber: string | null;

  /** When the auto-cancel reminder was sent (FR-ORD-012a) — null until sent; idempotency guard. */
  @Column({ name: 'reminder_sent_at', type: 'timestamptz', nullable: true })
  reminderSentAt: Date | null;

  /** CART idempotency key — a replayed placement with the same key returns the same order (BR-CART-7). */
  @Index({ unique: true, where: '"idempotency_key" IS NOT NULL' })
  @Column({ type: 'varchar', name: 'idempotency_key', length: 120, nullable: true })
  idempotencyKey: string | null;

  @Column({ name: 'placed_at', type: 'timestamptz' })
  placedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => OrderItemOrmEntity, (item) => item.order, { cascade: true })
  items: OrderItemOrmEntity[];
}

// re-export for convenience where the actor enum is needed alongside the entity
export { OrderActorType };
