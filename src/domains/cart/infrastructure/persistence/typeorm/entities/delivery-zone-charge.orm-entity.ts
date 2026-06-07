import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { DeliveryZone } from '../../../../domain/enums/delivery-zone.enum';

/**
 * ORM mapping for `delivery_zone_charges` (SRS 04 §8 DeliveryZoneCharge, FR-CART-040–043) — the
 * per-zone delivery charge + COD surcharge + optional free-shipping threshold + COD-enabled flag the
 * checkout quote reads. Money is Decimal(12,2); `cod_surcharge_pct` is a percentage (0–100). Seeded
 * with the resolved BD defaults (Inside ৳70 / Near ৳90 / Outside ৳120; COD 1% Outside only).
 */
@Entity('delivery_zone_charges')
export class DeliveryZoneChargeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: DeliveryZone, unique: true })
  zone: DeliveryZone;

  @Column({ name: 'delivery_charge', type: 'decimal', precision: 12, scale: 2, default: 0 })
  deliveryCharge: string;

  @Column({ name: 'cod_surcharge_pct', type: 'decimal', precision: 5, scale: 2, default: 0 })
  codSurchargePct: string;

  @Column({ name: 'cod_surcharge_flat', type: 'decimal', precision: 12, scale: 2, default: 0 })
  codSurchargeFlat: string;

  @Column({ name: 'free_shipping_threshold', type: 'decimal', precision: 12, scale: 2, nullable: true })
  freeShippingThreshold: string | null;

  @Column({ name: 'cod_enabled', default: true })
  codEnabled: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
