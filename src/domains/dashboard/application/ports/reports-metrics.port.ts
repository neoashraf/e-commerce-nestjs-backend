import { DateRange } from '../../domain/dashboard-period';
import { TopProduct, TrendPoint } from '../../domain/summary.types';

/**
 * RPT read port (FR-DASH-022). Source of the computed trend series and top-selling products —
 * the metrics RPT owns and DASH reuses verbatim (BR-DASH-2, §15). Real impl integrates with the
 * Reports module (`GetMetricsUseCase` / sales + product reports). See the stub adapter for the
 * representative implementation pending wiring.
 */
export interface ReportsMetricsPort {
  /** Per-day sales/orders series across the (inclusive) range. */
  getTrend(range: DateRange): Promise<TrendPoint[]>;
  /** Top-selling products in the range, by units. */
  getTopProducts(range: DateRange, limit: number): Promise<TopProduct[]>;
}

export const REPORTS_METRICS_PORT = Symbol('DashboardReportsMetricsPort');
