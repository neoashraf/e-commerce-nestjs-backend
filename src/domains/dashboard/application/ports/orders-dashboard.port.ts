import { DateRange } from '../../domain/dashboard-period';
import { RecentOrder } from '../../domain/summary.types';

/** Order-action alert counts (FR-DASH-010). */
export interface OrderActionCounts {
  orders_pending_payment: number;
  orders_to_process: number;
  orders_to_ship: number;
}

/**
 * ORD read port (FR-DASH-001/010/020/022). Order count for the KPI, order-action alert counts,
 * orders-by-status breakdown, and recent orders. Real impl integrates with the Orders module
 * read side. See the stub adapter for the representative implementation pending wiring.
 */
export interface OrdersDashboardPort {
  /** Placed-order count in the range (KPI orders). */
  getOrderCount(range: DateRange): Promise<number>;
  /** Counts of orders needing action (not period-scoped — current operational state). */
  getActionCounts(): Promise<OrderActionCounts>;
  /** Orders-by-status distribution within the range. */
  getOrdersByStatus(range: DateRange): Promise<Record<string, number>>;
  /** Most recent orders (newest first). */
  getRecentOrders(limit: number): Promise<RecentOrder[]>;
}

export const ORDERS_DASHBOARD_PORT = Symbol('DashboardOrdersPort');
