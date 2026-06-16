import { Injectable } from '@nestjs/common';

import { ReportBucket, ReportPeriod } from '../../../reports/domain/report-period';
import { GetSalesReportUseCase } from '../../../reports/application/use-cases/get-sales-report.use-case';
import { GetOrdersReportUseCase } from '../../../reports/application/use-cases/get-orders-report.use-case';
import { DateRange } from '../../domain/dashboard-period';
import { RecentOrder } from '../../domain/summary.types';
import {
  OrderActionCounts,
  OrdersDashboardPort,
} from '../../application/ports/orders-dashboard.port';

/**
 * RPT-backed OrdersDashboardPort (FR-DASH-001/010/020/022).
 *
 * - **Orders KPI** (`getOrderCount`) = the Sales report's paid/collected order count, so the dashboard's
 *   sales / orders / AOV all reconcile with `/admin/reports/sales` for the same range (BR-DASH-3).
 * - **Orders-by-status** (`getOrdersByStatus`) = the Orders report's by-status counts (all *placed* orders,
 *   incl. cancelled — the natural lifecycle distribution; FR-RPT-012). KPI orders (paid/collected) and the
 *   status breakdown (placed) are intentionally different populations — documented in the PR.
 *
 * The operational `getActionCounts` (current work queue, not period-scoped) and row-level `getRecentOrders`
 * are **not** expressible via RPT's aggregate read model, so they stay stubbed pending an ORD read side.
 */
@Injectable()
export class OrdersDashboardRptAdapter implements OrdersDashboardPort {
  constructor(
    private readonly sales: GetSalesReportUseCase,
    private readonly orders: GetOrdersReportUseCase,
  ) {}

  /** Paid/collected order count — sourced from the Sales report so it matches the sales KPI population. */
  async getOrderCount(range: DateRange): Promise<number> {
    const period = ReportPeriod.create(range.from, range.to, ReportBucket.DAY);
    const report = await this.sales.execute(period);
    return report.totals.orders;
  }

  /** Placed-order distribution by lifecycle status (FR-RPT-012). */
  async getOrdersByStatus(range: DateRange): Promise<Record<string, number>> {
    const period = ReportPeriod.create(range.from, range.to, ReportBucket.DAY);
    const report = await this.orders.execute(period);
    const out: Record<string, number> = {};
    for (const [status, entry] of Object.entries(report.by_status)) {
      out[status] = entry.count;
    }
    return out;
  }

  /**
   * TODO-INTEGRATION (ORD): the order work-queue counts are operational (current state, not period-scoped)
   * and have no RPT aggregate equivalent — kept stubbed until the Orders module exposes an action-count read.
   */
  async getActionCounts(): Promise<OrderActionCounts> {
    return { orders_pending_payment: 6, orders_to_process: 14, orders_to_ship: 5 };
  }

  /**
   * TODO-INTEGRATION (ORD): row-level recency is not part of RPT's aggregate read model — kept stubbed until
   * the Orders module exposes a recent-orders read side.
   */
  async getRecentOrders(limit: number): Promise<RecentOrder[]> {
    const sample: RecentOrder[] = [
      { order_no: 'SO-100246', customer: 'Sabbir Ahmed', grand_total: '12241.20', status: 'confirmed', placed_at: '2026-06-04T08:40:00Z' },
      { order_no: 'SO-100245', customer: 'Rafiq Islam', grand_total: '5890.00', status: 'processing', placed_at: '2026-06-04T07:55:00Z' },
      { order_no: 'SO-100244', customer: 'Nadia Karim', grand_total: '8320.50', status: 'packed', placed_at: '2026-06-04T06:30:00Z' },
      { order_no: 'SO-100243', customer: 'Tanvir Hasan', grand_total: '15600.00', status: 'delivered', placed_at: '2026-06-03T18:10:00Z' },
    ];
    return sample.slice(0, Math.max(0, limit));
  }
}
