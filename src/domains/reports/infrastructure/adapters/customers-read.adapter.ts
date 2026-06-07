import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { REPORT_TIMEZONE } from '../../domain/report-period';
import { ReportRange } from '../../application/ports/orders-read.port';
import {
  ICustomersReadModel,
  NewVsReturning,
  TopCustomerRow,
} from '../../application/ports/customers-read.port';
import { ratio } from '../../application/services/money.util';

/** A "completed" order counts toward revenue: online paid + COD collected (BR-RPT-2/8). */
const REVENUE_STATES = ['paid', 'cod_collected'];

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
}
