import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { OrderStatus } from '../../domain/order-enums';
import { OrderOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order.orm-entity';

/** Current order-work-queue counts for the admin dashboard "Needs attention" tiles (FR-DASH-010). */
export interface OrderActionCounts {
  pendingPayment: number;
  toProcess: number;
  toShip: number;
}

/** A recent-order row for the dashboard activity widget (FR-DASH-020). */
export interface RecentOrderRow {
  order_no: string;
  customer: string;
  grand_total: string;
  status: string;
  placed_at: string;
}

/**
 * Read-only order lookups exported for in-process cross-domain use (PAY's OrderGateway, the ORD
 * fulfilment/tracking slices, the admin DASH read ports). Returns the ORM entity for now — the
 * fulfilment/tracking briefs add the customer/admin read DTOs. Keeping reads here avoids other
 * domains touching ORD infrastructure.
 */
@Injectable()
export class OrderQueryService {
  constructor(
    @InjectRepository(OrderOrmEntity) private readonly orders: Repository<OrderOrmEntity>,
  ) {}

  /** Find an order by its human-readable `SO-` number. */
  async findByOrderNo(orderNo: string): Promise<OrderOrmEntity | null> {
    return this.orders.findOne({ where: { orderNo }, relations: { items: true } });
  }

  /** Find an order by id. */
  async findById(id: string): Promise<OrderOrmEntity | null> {
    return this.orders.findOne({ where: { id }, relations: { items: true } });
  }

  /**
   * Live counts of orders needing action (FR-DASH-010): awaiting payment, to fulfil
   * (`confirmed`/`processing`), and to ship (`packed`). Current operational state — not period-scoped.
   */
  async getActionCounts(): Promise<OrderActionCounts> {
    const [pendingPayment, toProcess, toShip] = await Promise.all([
      this.orders.count({ where: { status: OrderStatus.PENDING_PAYMENT } }),
      this.orders.count({ where: { status: In([OrderStatus.CONFIRMED, OrderStatus.PROCESSING]) } }),
      this.orders.count({ where: { status: OrderStatus.PACKED } }),
    ]);
    return { pendingPayment, toProcess, toShip };
  }

  /** Most recent orders, newest first (FR-DASH-020). Customer = registered recipient or guest name. */
  async getRecentOrders(limit: number): Promise<RecentOrderRow[]> {
    const rows = await this.orders.find({
      order: { placedAt: 'DESC' },
      take: Math.max(0, limit),
    });
    return rows.map((o) => ({
      order_no: o.orderNo,
      customer: o.guestName ?? o.addressSnapshot?.recipient_name ?? 'Customer',
      grand_total: o.grandTotal,
      status: o.status,
      placed_at: o.placedAt.toISOString(),
    }));
  }
}
