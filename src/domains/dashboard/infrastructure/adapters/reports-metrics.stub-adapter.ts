import { Injectable } from '@nestjs/common';

import { DateRange } from '../../domain/dashboard-period';
import { TopProduct, TrendPoint } from '../../domain/summary.types';
import { ReportsMetricsPort } from '../../application/ports/reports-metrics.port';
import { dailyOrders, dailyRevenue, eachDay } from './stub-data.util';

/**
 * RPT read-port stub (FR-DASH-022). Representative trend + top products.
 *
 * TODO-INTEGRATION (RPT): replace with a real adapter over the Reports module — the trend maps to
 * `GetSalesReportUseCase` time series, top products to `GetProductReportUseCase` (top sellers).
 */
@Injectable()
export class ReportsMetricsStubAdapter implements ReportsMetricsPort {
  async getTrend(range: DateRange): Promise<TrendPoint[]> {
    return eachDay(range).map((date) => ({
      date,
      sales: dailyRevenue(date).toFixed(2),
      orders: dailyOrders(date),
    }));
  }

  async getTopProducts(range: DateRange, limit: number): Promise<TopProduct[]> {
    const catalog: TopProduct[] = [
      { product_id: 'stub-prod-1', title: 'Adidas Predator Elite FG', units: 22, sales: '275000.00' },
      { product_id: 'stub-prod-2', title: 'Nike Mercurial Vapor 15', units: 18, sales: '243000.00' },
      { product_id: 'stub-prod-3', title: 'Puma Future Ultimate', units: 14, sales: '168000.00' },
      { product_id: 'stub-prod-4', title: 'Argentina Home Jersey 2026', units: 31, sales: '124000.00' },
      { product_id: 'stub-prod-5', title: 'Nivia Turf Trainer', units: 12, sales: '36000.00' },
    ];
    return catalog.slice(0, Math.max(0, limit));
  }
}
