import { Injectable } from '@nestjs/common';

import { ReportBucket, ReportPeriod } from '../../../reports/domain/report-period';
import { GetSalesReportUseCase } from '../../../reports/application/use-cases/get-sales-report.use-case';
import { GetPaymentsReportUseCase } from '../../../reports/application/use-cases/get-payments-report.use-case';
import { DateRange } from '../../domain/dashboard-period';
import { PaymentsDashboardPort } from '../../application/ports/payments-dashboard.port';

/**
 * RPT-backed PaymentsDashboardPort (FR-DASH-001/022, BR-DASH-3). The Sales KPI revenue is the Sales
 * report's **net revenue** (paid/collected grand totals − completed refunds), guaranteeing DASH↔RPT
 * Sales-report parity (BR-DASH-3, FR-RPT-003) — never the raw paid-orders total. The payment-method
 * split is the Payment report's `method_split`. Delegates into the RPT application layer.
 */
@Injectable()
export class PaymentsDashboardRptAdapter implements PaymentsDashboardPort {
  constructor(
    private readonly sales: GetSalesReportUseCase,
    private readonly payments: GetPaymentsReportUseCase,
  ) {}

  /** Net paid (online) + COD-collected revenue, net of refunds, in BDT (BR-DASH-3). */
  async getRevenue(range: DateRange): Promise<number> {
    const period = ReportPeriod.create(range.from, range.to, ReportBucket.DAY);
    const report = await this.sales.execute(period);
    return Number(report.totals.net_revenue);
  }

  /** Average order value = the Sales report's `aov` (net revenue ÷ paid/collected orders), in BDT. */
  async getAvgOrderValue(range: DateRange): Promise<number> {
    const period = ReportPeriod.create(range.from, range.to, ReportBucket.DAY);
    const report = await this.sales.execute(period);
    return Number(report.totals.aov);
  }

  /** Paid/collected order counts by payment method (cod / bkash / sslcommerz) in the range. */
  async getPaymentSplit(range: DateRange): Promise<Record<string, number>> {
    const period = ReportPeriod.create(range.from, range.to, ReportBucket.DAY);
    const report = await this.payments.execute(period);
    return report.method_split;
  }
}
