import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/** Per-customer spend aggregates for the 360 profile (FR-CUST-012, BR-CUST-3). */
export interface CustomerOrderAggregate {
  orderCount: number;
  totalSpent: string;
  avgOrderValue: string;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
}

/** A row in the customer's recent order history (FR-CUST-012, deep-linkable by order_no — FR-CUST-014). */
export interface RecentOrder {
  orderNo: string;
  status: string;
  grandTotal: string;
  placedAt: string;
}

/**
 * Read port over ORD for customer spend/history (BR-CUST-3: LTV counts paid/COD-collected orders, net of
 * refunds — refunded orders leave the revenue states so they never inflate LTV). Read-only; decoupled
 * from ORD's ORM classes.
 */
export interface IOrderStats {
  getProfileAggregates(customerId: string): Promise<CustomerOrderAggregate>;
  getRecentOrders(customerId: string, limit: number): Promise<RecentOrder[]>;
}

export const ORDER_STATS = Symbol('IOrderStats');

/** Order states that count toward revenue/LTV (online paid + COD collected; BR-CUST-3). */
export const REVENUE_STATES = ['paid', 'cod_collected'];

/** Real adapter — aggregates the ORD `orders` table via DataSource. */
@Injectable()
export class OrderStatsAdapter implements IOrderStats {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getProfileAggregates(customerId: string): Promise<CustomerOrderAggregate> {
    const rows: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT COUNT(*)::int AS order_count,
              COALESCE(SUM(grand_total), 0)::text AS total_spent,
              MIN(placed_at) AS first_order_at,
              MAX(placed_at) AS last_order_at
       FROM orders
       WHERE customer_id = $1 AND payment_state::text = ANY($2)`,
      [customerId, REVENUE_STATES],
    );
    const r = rows[0] ?? {};
    const orderCount = Number(r.order_count ?? 0);
    const totalSpent = (r.total_spent as string) ?? '0';
    const avg = orderCount > 0 ? Number(totalSpent) / orderCount : 0;
    return {
      orderCount,
      totalSpent: this.money(totalSpent),
      avgOrderValue: this.money(avg),
      firstOrderAt: r.first_order_at ? (r.first_order_at as Date).toISOString() : null,
      lastOrderAt: r.last_order_at ? (r.last_order_at as Date).toISOString() : null,
    };
  }

  async getRecentOrders(customerId: string, limit: number): Promise<RecentOrder[]> {
    const rows: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT order_no, status, grand_total, placed_at
       FROM orders WHERE customer_id = $1
       ORDER BY placed_at DESC LIMIT $2`,
      [customerId, limit],
    );
    return rows.map((r) => ({
      orderNo: r.order_no as string,
      status: r.status as string,
      grandTotal: this.money((r.grand_total as string) ?? '0'),
      placedAt: (r.placed_at as Date).toISOString(),
    }));
  }

  /** Normalize a numeric/string amount to a fixed Decimal(12,2) string (BDT). */
  private money(value: string | number): string {
    return Number(value).toFixed(2);
  }
}
