import { Injectable } from '@nestjs/common';

import { DateRange } from '../../domain/dashboard-period';
import { RecentOrder } from '../../domain/summary.types';
import {
  OrderActionCounts,
  OrdersDashboardPort,
} from '../../application/ports/orders-dashboard.port';
import { dailyOrders, eachDay } from './stub-data.util';

/**
 * ORD read-port stub (FR-DASH-001/010/020/022). Representative order count, action counts,
 * status split, and recent orders.
 *
 * TODO-INTEGRATION (ORD): replace with a real adapter over the Orders module read side
 * (placed-count by range, action-needed counts by status, by-status aggregation, recent list).
 */
@Injectable()
export class OrdersDashboardStubAdapter implements OrdersDashboardPort {
  async getOrderCount(range: DateRange): Promise<number> {
    return eachDay(range).reduce((sum, day) => sum + dailyOrders(day), 0);
  }

  async getActionCounts(): Promise<OrderActionCounts> {
    return { orders_pending_payment: 6, orders_to_process: 14, orders_to_ship: 5 };
  }

  async getOrdersByStatus(range: DateRange): Promise<Record<string, number>> {
    const total = await this.getOrderCount(range);
    return {
      confirmed: Math.round(total * 0.16),
      processing: Math.round(total * 0.11),
      shipped: Math.round(total * 0.05),
      delivered: Math.round(total * 0.62),
      cancelled: Math.round(total * 0.06),
    };
  }

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
