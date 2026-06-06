import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { OrderOrmEntity } from './order.orm-entity';

/**
 * ORM mapping for `order_items` (SRS 06 §8 OrderItem) — an immutable line snapshot at purchase
 * (BR-ORD-1): product/variant references plus the title, SKU, options, unit price, qty and line
 * total captured at placement, unaffected by later catalog/price changes.
 */
@Entity('order_items')
@Index(['orderId'])
export class OrderItemOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @ManyToOne(() => OrderOrmEntity, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: OrderOrmEntity;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ name: 'variant_id', type: 'uuid' })
  variantId: string;

  @Column({ name: 'product_title', length: 180 })
  productTitle: string;

  @Column({ name: 'sku_code', length: 64 })
  skuCode: string;

  @Column({ name: 'variant_options', type: 'jsonb', default: () => "'{}'" })
  variantOptions: Record<string, string>;

  @Column({ name: 'unit_price', type: 'decimal', precision: 12, scale: 2 })
  unitPrice: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ name: 'line_total', type: 'decimal', precision: 12, scale: 2 })
  lineTotal: string;
}
