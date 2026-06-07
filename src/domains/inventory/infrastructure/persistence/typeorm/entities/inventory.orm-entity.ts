import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * ORM mapping for `inventory` (SRS 11 §8 Inventory) — the authoritative per-SKU stock record
 * (one per `CAT.ProductVariant`, BR-INV-3). `available` is persisted (`on_hand − reserved`) for
 * query speed. `reserved`/`last_alert_at` are present but reserved for the deferred reservations/
 * alerts flows (read-only here). DB-level non-negative constraints on `on_hand`/`reserved` and a
 * unique `variant_id` index are added in the migration.
 */
@Entity('inventory')
export class InventoryOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'variant_id', type: 'uuid' })
  variantId: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ name: 'on_hand', type: 'int', default: 0 })
  onHand: number;

  @Column({ name: 'reserved', type: 'int', default: 0 })
  reserved: number;

  @Column({ name: 'available', type: 'int', default: 0 })
  available: number;

  @Column({ name: 'low_stock_threshold', type: 'int', default: 0 })
  lowStockThreshold: number;

  @Column({ name: 'last_alert_at', type: 'timestamptz', nullable: true })
  lastAlertAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
