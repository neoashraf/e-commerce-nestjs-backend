import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { REPORT_TIMEZONE } from '../../domain/report-period';
import { ReportRange } from '../../application/ports/orders-read.port';
import {
  CustomerDirectoryExportRow,
  CustomerDirectoryFilter,
  ICustomersReadModel,
  NewVsReturning,
  TopCustomerRow,
} from '../../application/ports/customers-read.port';
import { ratio } from '../../application/services/money.util';

/** A "completed" order counts toward revenue: online paid + COD collected (BR-RPT-2/8). */
const REVENUE_STATES = ['paid', 'cod_collected'];

/** Hard cap on directory-export rows (parity with CUST's export; guards an unbounded file). */
const DIRECTORY_EXPORT_MAX_ROWS = 50_000;

/**
 * Read-only CUST adapter for RPT. Derives new-vs-returning and top-LTV from the `customers` / `orders`
 * tables using the *shared* definitions (BR-RPT-8): a customer's "first order" is the earliest completed
 * (revenue-state) order; new = first order in the period, returning = ordered in the period with an
 * earlier completed order. LTV is lifetime paid/collected order value. Read-side only (BR-RPT-5),
 * decoupled from CUST/AUTH ORM classes. Day boundaries are evaluated in Asia/Dhaka (BR-RPT-4).
 */
@Injectable()
export class CustomersReadAdapter implements ICustomersReadModel {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getNewVsReturning(range: ReportRange): Promise<NewVsReturning> {
    const [row]: Array<{ new_customers: number; returning_customers: number }> =
      await this.dataSource.query(
        `WITH completed AS (
           SELECT customer_id,
                  (placed_at AT TIME ZONE '${REPORT_TIMEZONE}')::date AS local_day
           FROM orders
           WHERE customer_id IS NOT NULL AND payment_state::text = ANY($3)
         ),
         first_order AS (
           SELECT customer_id, MIN(local_day) AS first_day FROM completed GROUP BY customer_id
         ),
         in_period AS (
           SELECT DISTINCT customer_id FROM completed
           WHERE local_day BETWEEN $1::date AND $2::date
         )
         SELECT
           COUNT(*) FILTER (WHERE f.first_day BETWEEN $1::date AND $2::date)::int AS new_customers,
           COUNT(*) FILTER (WHERE ip.customer_id IS NOT NULL AND f.first_day < $1::date)::int
             AS returning_customers
         FROM first_order f
         LEFT JOIN in_period ip ON ip.customer_id = f.customer_id`,
        [range.from, range.to, REVENUE_STATES],
      );
    const newCustomers = Number(row?.new_customers ?? 0);
    const returning = Number(row?.returning_customers ?? 0);
    return {
      new_customers: newCustomers,
      returning_customers: returning,
      repeat_rate: ratio(returning, newCustomers + returning),
    };
  }

  async getTopByLtv(_range: ReportRange, topN: number): Promise<TopCustomerRow[]> {
    const rows: Array<{ customer_id: string; name: string; ltv: string; orders: number }> =
      await this.dataSource.query(
        `SELECT o.customer_id AS customer_id,
                COALESCE(c.full_name, '') AS name,
                COALESCE(SUM(o.grand_total), 0)::text AS ltv,
                COUNT(*)::int AS orders
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         WHERE o.payment_state::text = ANY($2)
         GROUP BY o.customer_id, c.full_name
         ORDER BY SUM(o.grand_total) DESC
         LIMIT $1`,
        [topN, REVENUE_STATES],
      );
    return rows.map((r) => ({
      customer_id: r.customer_id,
      name: r.name,
      ltv: r.ltv,
      orders: Number(r.orders),
    }));
  }

  /**
   * Row-level customer directory for the Customers export. Registered customers only (guests excluded —
   * parity with CUST's export, which sets `include_guests:false`), with the same list filters (q / status /
   * tag / last-order range) and per-row aggregates (paid/collected count, lifetime value, last order).
   * Capped at {@link DIRECTORY_EXPORT_MAX_ROWS}. Read-side only (BR-RPT-5); decoupled from CUST/AUTH ORM.
   */
  async listDirectory(f: CustomerDirectoryFilter): Promise<CustomerDirectoryExportRow[]> {
    const params: unknown[] = [];
    const p = (v: unknown): string => {
      params.push(v);
      return `$${params.length}`;
    };
    const rev = p(REVENUE_STATES);

    const where: string[] = [];
    if (f.q) {
      const q = p(`%${f.q}%`);
      where.push(`(c.full_name ILIKE ${q} OR c.phone ILIKE ${q} OR c.email ILIKE ${q})`);
    }
    if (f.status) where.push(`c.status = ${p(f.status)}`);
    if (f.tag) {
      where.push(
        `EXISTS (SELECT 1 FROM customer_tag_assignments cta JOIN customer_tags t ON t.id = cta.tag_id ` +
          `WHERE cta.customer_id = c.id AND t.key = ${p(f.tag)})`,
      );
    }
    if (f.lastOrderFrom) where.push(`agg.last_order_at >= ${p(f.lastOrderFrom)}`);
    if (f.lastOrderTo) where.push(`agg.last_order_at <= ${p(f.lastOrderTo)}`);

    const limitP = p(DIRECTORY_EXPORT_MAX_ROWS);
    const rows: Array<{
      customer_id: string;
      full_name: string | null;
      phone: string | null;
      email: string | null;
      status: string;
      order_count: number;
      total_spent: string;
      last_order_at: Date | null;
    }> = await this.dataSource.query(
      `SELECT c.id::text AS customer_id, c.full_name, c.phone, c.email, c.status,
              COALESCE(agg.order_count, 0)::int AS order_count,
              COALESCE(agg.total_spent, 0)::text AS total_spent,
              agg.last_order_at AS last_order_at
       FROM customers c
       LEFT JOIN (
         SELECT customer_id, COUNT(*) AS order_count, SUM(grand_total) AS total_spent,
                MAX(placed_at) AS last_order_at
         FROM orders
         WHERE customer_id IS NOT NULL AND payment_state::text = ANY(${rev})
         GROUP BY customer_id
       ) agg ON agg.customer_id = c.id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY agg.last_order_at DESC NULLS LAST, c.full_name ASC
       LIMIT ${limitP}`,
      params,
    );

    return rows.map((r) => ({
      customer_id: r.customer_id,
      full_name: r.full_name ?? '',
      phone: r.phone ?? '',
      email: r.email ?? '',
      status: r.status,
      order_count: Number(r.order_count ?? 0),
      total_spent: Number(r.total_spent ?? 0).toFixed(2),
      last_order_at: r.last_order_at ? r.last_order_at.toISOString() : '',
    }));
  }
}
