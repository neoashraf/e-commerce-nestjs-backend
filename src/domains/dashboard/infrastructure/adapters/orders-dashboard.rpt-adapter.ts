import { Injectable } from '@nestjs/common';

import { ReportBucket, ReportPeriod } from '../../../reports/domain/report-period';
import { GetOrdersReportUseCase } from '../../../reports/application/use-cases/get-orders-report.use-case';
import { OrderQueryService } from '../../../orders/application/services/order-query.service';
import { DateRange } from '../../domain/dashboard-period';
import { RecentOrder } from '../../domain/summary.types';
import {
  OrderActionCounts,
  OrdersDashboardPort,
} from '../../application/ports/orders-dashboard.port';

/**
 * RPT-backed OrdersDashboardPort (FR-DASH-001/010/020/022).
 *
 * - **Orders KPI** (`getOrderCount`) = **placed** orders in the period — the sum of the Orders report's
 *   by-status counts, so the headline Orders card reconciles exactly with the orders-by-status breakdown.
 *   (Decision 2026-06-18: the Orders card counts orders *placed*, not only paid — Net Revenue stays
 *   collected-only, AOV is sourced from the Sales report. SRS §10 open KPI question, resolved.)
 * - **Orders-by-status** (`getOrdersByStatus`) = the Orders report's by-status counts (all placed orders;
 *   FR-RPT-012).
 * - **Action counts** (`getActionCounts`) + **recent orders** (`getRecentOrders`) are the live operational
 *   state — sourced directly from the ORD read side ({@link OrderQueryService}), not RPT, since RPT's
 *   period-scoped aggregate model can't express "current work queue" / row-level recency.
 */
@Injectable()
export class OrdersDashboardRptAdapter implements OrdersDashboardPort {
  constructor(
    private readonly orders: GetOrdersReportUseCase,
    private readonly orderQuery: OrderQueryService,
  ) {}

  /** Placed-order count in the period = sum of the Orders report's by-status counts (FR-DASH-001). */
  async getOrderCount(range: DateRange): Promise<number> {
    const byStatus = await this.getOrdersByStatus(range);
    return Object.values(byStatus).reduce((sum, count) => sum + count, 0);
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

  /** Live order work-queue counts from the ORD read side (FR-DASH-010). */
  async getActionCounts(): Promise<OrderActionCounts> {
    const counts = await this.orderQuery.getActionCounts();
    return {
      orders_pending_payment: counts.pendingPayment,
      orders_to_process: counts.toProcess,
      orders_to_ship: counts.toShip,
    };
  }

  /** Most recent orders from the ORD read side (FR-DASH-020). */
  getRecentOrders(limit: number): Promise<RecentOrder[]> {
    return this.orderQuery.getRecentOrders(limit);
  }
}
