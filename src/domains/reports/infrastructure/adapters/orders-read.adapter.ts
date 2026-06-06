import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ReportBucket, REPORT_TIMEZONE, SalesBreakdown } from '../../domain/report-period';
import {
  IOrdersReadModel,
  OrderRateCounts,
  OrdersByStatusRow,
  PaidOrdersBucketRow,
  PaidOrdersTotals,
  ReportRange,
} from '../../application/ports/orders-read.port';

/** Order states that count toward revenue (BR-RPT-2: online paid + COD collected). */
const REVENUE_STATES = ['paid', 'cod_collected'];

/**
 * Read-only ORD adapter for RPT. Runs parameterised aggregation SQL over the `orders` / `order_items`
 * tables (and `products`/`categories` for the category breakdown) — read-side only, never mutating
 * (BR-RPT-5). Day/week/month buckets and the period filter are evaluated in Asia/Dhaka so an order at
 * 11:55 PM lands in the correct local day (BR-RPT-4, §12.4); week = ISO (Monday), month = calendar.
 * Revenue is attributed by `placed_at`. Decoupled from ORD's ORM classes (table/column names only).
 */
@Injectable()
export class OrdersReadAdapter implements IOrdersReadModel {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** `placed_at` truncated to the bucket, in local time, as `YYYY-MM-DD`. */
  private bucketExpr(column: string): string {
    return `to_char(date_trunc($3, (${column} AT TIME ZONE '${REPORT_TIMEZONE}')), 'YYYY-MM-DD')`;
  }

  /** Local-day predicate: the order's Asia/Dhaka calendar day is within `[from, to]`. */
  private rangePredicate(column: string): string {
    return `(${column} AT TIME ZONE '${REPORT_TIMEZONE}')::date BETWEEN $1::date AND $2::date`;
  }

  async getPaidOrdersSeries(
    range: ReportRange,
    bucket: ReportBucket,
  ): Promise<PaidOrdersBucketRow[]> {
    const rows: Array<{ bucket: string; revenue: string; orders: number; units: number }> =
      await this.dataSource.query(
        `SELECT ${this.bucketExpr('o.placed_at')} AS bucket,
                COALESCE(SUM(o.grand_total), 0)::text AS revenue,
                COUNT(*)::int AS orders,
                COALESCE(SUM(oi.units), 0)::int AS units
         FROM orders o
         LEFT JOIN (
           SELECT order_id, SUM(quantity) AS units FROM order_items GROUP BY order_id
         ) oi ON oi.order_id = o.id
         WHERE o.payment_state::text = ANY($4)
           AND ${this.rangePredicate('o.placed_at')}
         GROUP BY 1 ORDER BY 1`,
        [range.from, range.to, bucket, REVENUE_STATES],
      );
    return rows.map((r) => ({
      bucket: r.bucket,
      revenue: r.revenue,
      orders: Number(r.orders),
      units: Number(r.units),
    }));
  }

  async getPaidOrdersTotals(range: ReportRange): Promise<PaidOrdersTotals> {
    const [row]: Array<{
      revenue: string;
      gross_placed_value: string;
      orders: number;
      units: number;
    }> = await this.dataSource.query(
      `SELECT
         COALESCE(SUM(o.grand_total) FILTER (WHERE o.payment_state::text = ANY($3)), 0)::text AS revenue,
         COALESCE(SUM(o.grand_total), 0)::text AS gross_placed_value,
         COUNT(*) FILTER (WHERE o.payment_state::text = ANY($3))::int AS orders,
         COALESCE(SUM(oi.units) FILTER (WHERE o.payment_state::text = ANY($3)), 0)::int AS units
       FROM orders o
       LEFT JOIN (
         SELECT order_id, SUM(quantity) AS units FROM order_items GROUP BY order_id
       ) oi ON oi.order_id = o.id
       WHERE ${this.rangePredicate('o.placed_at')}`,
      [range.from, range.to, REVENUE_STATES],
    );
    return {
      revenue: row?.revenue ?? '0.00',
      gross_placed_value: row?.gross_placed_value ?? '0.00',
      orders: Number(row?.orders ?? 0),
      units: Number(row?.units ?? 0),
    };
  }

  async getSalesBreakdown(
    range: ReportRange,
    dimension: SalesBreakdown,
  ): Promise<Record<string, string>> {
    const params = [range.from, range.to, REVENUE_STATES];
    let sql: string;
    if (dimension === SalesBreakdown.CATEGORY) {
      sql = `SELECT COALESCE(c.name, 'Uncategorized') AS k, COALESCE(SUM(oi.line_total), 0)::text AS v
             FROM orders o
             JOIN order_items oi ON oi.order_id = o.id
             LEFT JOIN products p ON p.id = oi.product_id
             LEFT JOIN categories c ON c.id = p.primary_category_id
             WHERE o.payment_state::text = ANY($3) AND ${this.rangePredicate('o.placed_at')}
             GROUP BY 1 ORDER BY 2 DESC`;
    } else {
      const col = dimension === SalesBreakdown.DELIVERY_ZONE ? 'o.delivery_zone' : 'o.payment_method';
      sql = `SELECT ${col} AS k, COALESCE(SUM(o.grand_total), 0)::text AS v
             FROM orders o
             WHERE o.payment_state::text = ANY($3) AND ${this.rangePredicate('o.placed_at')}
             GROUP BY 1 ORDER BY 2 DESC`;
    }
    const rows: Array<{ k: string; v: string }> = await this.dataSource.query(sql, params);
    const out: Record<string, string> = {};
    for (const r of rows) out[r.k] = r.v;
    return out;
  }

  async getOrdersByStatus(range: ReportRange): Promise<OrdersByStatusRow[]> {
    const rows: Array<{ status: string; count: number; value: string }> =
      await this.dataSource.query(
        `SELECT o.status AS status, COUNT(*)::int AS count, COALESCE(SUM(o.grand_total), 0)::text AS value
         FROM orders o
         WHERE ${this.rangePredicate('o.placed_at')}
         GROUP BY o.status`,
        [range.from, range.to],
      );
    return rows.map((r) => ({ status: r.status, count: Number(r.count), value: r.value }));
  }

  async getOrderRateCounts(range: ReportRange): Promise<OrderRateCounts> {
    const [row]: Array<{ total: number; cancelled: number; returned: number }> =
      await this.dataSource.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE o.status = 'cancelled')::int AS cancelled,
                COUNT(*) FILTER (WHERE o.status IN ('exchange_requested', 'exchanged'))::int AS returned
         FROM orders o
         WHERE ${this.rangePredicate('o.placed_at')}`,
        [range.from, range.to],
      );
    return {
      total: Number(row?.total ?? 0),
      cancelled: Number(row?.cancelled ?? 0),
      returned: Number(row?.returned ?? 0),
    };
  }
}
