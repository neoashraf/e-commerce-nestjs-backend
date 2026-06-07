import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { ReservationStatus } from '../../../../domain/reservation-status';

/**
 * ORM mapping for `stock_reservations` (SRS 11 §8 StockReservation, FR-INV-020–023). One row per
 * (order, variant) hold. `status` drives idempotency (reserve/release/decrement key on `order_id` +
 * status). Indexed on `order_id` for order lookup and on `(status, expires_at)` for the expiry sweep.
 */
@Entity('stock_reservations')
@Index('idx_stock_reservations_order', ['orderId'])
@Index('idx_stock_reservations_status_expires', ['status', 'expiresAt'])
export class StockReservationOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @Column({ name: 'variant_id', type: 'uuid' })
  variantId: string;

  @Column({ name: 'quantity', type: 'int' })
  quantity: number;

  @Column({ name: 'status', type: 'enum', enum: ReservationStatus, default: ReservationStatus.HELD })
  status: ReservationStatus;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
