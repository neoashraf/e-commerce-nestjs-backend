import { Injectable } from '@nestjs/common';

import { ReportBucket, ReportPeriod } from '../../../reports/domain/report-period';
import { ProductMetric, ProductView } from '../../../reports/domain/report-views';
import { GetSalesReportUseCase } from '../../../reports/application/use-cases/get-sales-report.use-case';
import { GetProductReportUseCase } from '../../../reports/application/use-cases/get-product-report.use-case';
import { DateRange } from '../../domain/dashboard-period';
import { TopProduct, TrendPoint } from '../../domain/summary.types';
import { ReportsMetricsPort } from '../../application/ports/reports-metrics.port';

/**
 * RPT-backed ReportsMetricsPort (FR-DASH-022, BR-DASH-2). The trend series and top-selling products
 * are reused **verbatim** from RPT so DASH renders the same numbers as the Sales / Product reports
 * (single-sourced metrics — §15). Delegates into the RPT application layer (`GetSalesReportUseCase`,
 * `GetProductReportUseCase`) — never into the source domains' ORM (DDD layering intact).
 */
@Injectable()
export class ReportsMetricsRptAdapter implements ReportsMetricsPort {
  constructor(
    private readonly sales: GetSalesReportUseCase,
    private readonly products: GetProductReportUseCase,
  ) {}

  /** Per-day sales/orders series — the Sales report's net-of-refunds series (BR-RPT-2/3). */
  async getTrend(range: DateRange): Promise<TrendPoint[]> {
    const period = ReportPeriod.create(range.from, range.to, ReportBucket.DAY);
    const report = await this.sales.execute(period);
    return report.series.map((point) => ({
      date: point.bucket,
      sales: point.net_revenue,
      orders: point.orders,
    }));
  }

  /** Top sellers by revenue over paid/collected order items — the Product report `top_sellers` view. */
  async getTopProducts(range: DateRange, limit: number): Promise<TopProduct[]> {
    const period = ReportPeriod.create(range.from, range.to, ReportBucket.DAY);
    const rows = await this.products.execute(period, ProductView.TOP_SELLERS, ProductMetric.REVENUE, limit);
    return rows.map((row) => ({
      product_id: 'product_id' in row ? row.product_id : row.category_id,
      title: row.title,
      units: row.units,
      sales: row.revenue,
    }));
  }
}
