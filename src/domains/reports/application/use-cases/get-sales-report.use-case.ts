import { Inject, Injectable } from '@nestjs/common';

import { ReportBucket, ReportPeriod, SalesBreakdown } from '../../domain/report-period';
import {
  IOrdersReadModel,
  ORDERS_READ_MODEL,
  PaidOrdersBucketRow,
} from '../ports/orders-read.port';
import { IPaymentsReadModel, PAYMENTS_READ_MODEL } from '../ports/payments-read.port';
import { ReportCacheService } from '../services/report-cache.service';
import { divideMoney, fromPaisa, subtractMoney, toPaisa } from '../services/money.util';

/** One bucket of the sales time series (FR-RPT-010). Monetary fields are 2dp BDT strings. */
export interface SalesSeriesPoint {
  bucket: string;
  net_revenue: string;
  orders: number;
  units: number;
  aov: string;
}

/** Period totals (FR-RPT-010). */
export interface SalesTotals {
  net_revenue: string;
  gross_placed_value: string;
  orders: number;
  units: number;
  aov: string;
}

/** Full sales report payload (contract: Sales report). */
export interface SalesReport {
  totals: SalesTotals;
  series: SalesSeriesPoint[];
  breakdown: Record<string, Record<string, string>>;
  as_of: string;
}

/**
 * Sales report (FR-RPT-010/011, BR-RPT-2/3). Net revenue = paid/collected order grand totals − completed
 * refunds, per bucket and in total; gross placed value is reported as a distinct figure (never conflated
 * with revenue). Optional breakdown by category / delivery zone / payment method. Reads ORD + PAY through
 * ports and serves from the aggregate cache with an `as_of` stamp (BR-RPT-7).
 */
@Injectable()
export class GetSalesReportUseCase {
  constructor(
    @Inject(ORDERS_READ_MODEL) private readonly orders: IOrdersReadModel,
    @Inject(PAYMENTS_READ_MODEL) private readonly payments: IPaymentsReadModel,
    private readonly cache: ReportCacheService,
  ) {}

  async execute(
    period: ReportPeriod,
    breakdown: SalesBreakdown = SalesBreakdown.NONE,
  ): Promise<SalesReport> {
    const range = { from: period.from, to: period.to };
    const key = `sales:${period.from}:${period.to}:${period.bucket}:${breakdown}`;

    const cached = await this.cache.getOrCompute(key, async () => {
      const [paidSeries, refundSeries, totals, refundsTotal, breakdownData] = await Promise.all([
        this.orders.getPaidOrdersSeries(range, period.bucket),
        this.payments.getRefundsSeries(range, period.bucket),
        this.orders.getPaidOrdersTotals(range),
        this.payments.getRefundsTotal(range),
        breakdown === SalesBreakdown.NONE
          ? Promise.resolve<Record<string, string>>({})
          : this.orders.getSalesBreakdown(range, breakdown),
      ]);

      const netRevenue = subtractMoney(totals.revenue, refundsTotal);
      const series = this.buildSeries(paidSeries, refundSeries);

      const result: Omit<SalesReport, 'as_of'> = {
        totals: {
          net_revenue: netRevenue,
          gross_placed_value: totals.gross_placed_value,
          orders: totals.orders,
          units: totals.units,
          aov: divideMoney(netRevenue, totals.orders),
        },
        series,
        breakdown:
          breakdown === SalesBreakdown.NONE ? {} : { [breakdown]: breakdownData },
      };
      return result;
    });

    return { ...cached.value, as_of: cached.asOf };
  }

  /** Merge paid-order and refund series on the bucket key; net_revenue = paid − refunds per bucket. */
  private buildSeries(
    paid: PaidOrdersBucketRow[],
    refunds: Array<{ bucket: string; amount: string }>,
  ): SalesSeriesPoint[] {
    const refundByBucket = new Map(refunds.map((r) => [r.bucket, r.amount]));
    const paidByBucket = new Map(paid.map((p) => [p.bucket, p]));
    const buckets = [...new Set([...paidByBucket.keys(), ...refundByBucket.keys()])].sort();

    return buckets.map((bucket) => {
      const p = paidByBucket.get(bucket);
      const revenuePaisa = toPaisa(p?.revenue ?? '0') - toPaisa(refundByBucket.get(bucket) ?? '0');
      const netRevenue = fromPaisa(revenuePaisa);
      const orders = p?.orders ?? 0;
      return {
        bucket,
        net_revenue: netRevenue,
        orders,
        units: p?.units ?? 0,
        aov: divideMoney(netRevenue, orders),
      };
    });
  }
}
