import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import {
  StockMovementActorType,
  StockMovementType,
} from '../../../../domain/stock-movement-type';

/**
 * ORM mapping for `stock_movements` — the append-only stock ledger (SRS 11 §5.6 / §8, FR-INV-050/052).
 * One immutable row per quantity change with a signed `quantity_delta`, the `resulting_on_hand` after
 * the change, an optional reason/order reference, and the actor. There are intentionally NO updatable
 * timestamp or setter paths: the entity is insert-only (FR-INV-052) and the table is never UPDATE/DELETE'd.
 * Indexed on `(variant_id, created_at)` for the history query and on `type` for the type filter.
 */
@Entity('stock_movements')
@Index('idx_stock_movements_variant_created', ['variantId', 'createdAt'])
@Index('idx_stock_movements_type', ['type'])
export class StockMovementOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'variant_id', type: 'uuid' })
  variantId: string;

  @Column({ name: 'type', type: 'enum', enum: StockMovementType })
  type: StockMovementType;

  @Column({ name: 'quantity_delta', type: 'int' })
  quantityDelta: number;

  @Column({ name: 'resulting_on_hand', type: 'int' })
  resultingOnHand: number;

  @Column({ name: 'reason', type: 'varchar', length: 160, nullable: true })
  reason: string | null;

  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId: string | null;

  @Column({ name: 'actor_type', type: 'enum', enum: StockMovementActorType })
  actorType: StockMovementActorType;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
