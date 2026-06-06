import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { OrderActorType, OrderStatus } from '../../../../domain/order-enums';

/**
 * ORM mapping for `order_status_history` (SRS 06 §8 OrderStatusHistory) — an append-only trail of every
 * status change (from, to, actor, note, timestamp) (BR-ORD-7, FR-ORD-023). Never updated/deleted.
 * `from_status` is null for the creation entry.
 */
@Entity('order_status_history')
@Index(['orderId'])
export class OrderStatusHistoryOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @Column({ name: 'from_status', type: 'enum', enum: OrderStatus, nullable: true })
  fromStatus: OrderStatus | null;

  @Column({ name: 'to_status', type: 'enum', enum: OrderStatus })
  toStatus: OrderStatus;

  @Column({ name: 'actor_type', type: 'enum', enum: OrderActorType })
  actorType: OrderActorType;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ length: 255, nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
