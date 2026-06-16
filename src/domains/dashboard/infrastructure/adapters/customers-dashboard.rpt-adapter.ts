import { Injectable } from '@nestjs/common';

import { ReportPeriod } from '../../../reports/domain/report-period';
import { CustomerView } from '../../../reports/domain/report-views';
import { GetCustomersReportUseCase } from '../../../reports/application/use-cases/get-customers-report.use-case';
import { DateRange } from '../../domain/dashboard-period';
import { RecentCustomer } from '../../domain/summary.types';
import { CustomersDashboardPort } from '../../application/ports/customers-dashboard.port';

/**
 * RPT-backed CustomersDashboardPort (FR-DASH-001/021). The new-customer KPI is the Customer report's
 * `new_vs_returning.new` count (single-sourced with RPT — BR-DASH-2). Row-level `getRecentCustomers`
 * has no RPT aggregate equivalent and stays stubbed pending a CUST read side.
 */
@Injectable()
export class CustomersDashboardRptAdapter implements CustomersDashboardPort {
  constructor(private readonly customers: GetCustomersReportUseCase) {}

  /** Count of customers registered in the range — the Customer report `new` figure (FR-RPT-040). */
  async getNewCustomerCount(range: DateRange): Promise<number> {
    const period = ReportPeriod.create(range.from, range.to);
    const report = await this.customers.execute(period, CustomerView.NEW_VS_RETURNING, 0);
    return report.new_customers;
  }

  /**
   * TODO-INTEGRATION (CUST): row-level recency is not part of RPT's aggregate read model — kept stubbed until
   * the Customers module exposes a recent-registrations read side.
   */
  async getRecentCustomers(limit: number): Promise<RecentCustomer[]> {
    const sample: RecentCustomer[] = [
      { customer_id: 'stub-cust-1', name: 'Imran Chowdhury', registered_at: '2026-06-04T08:20:00Z' },
      { customer_id: 'stub-cust-2', name: 'Farzana Akter', registered_at: '2026-06-04T07:05:00Z' },
      { customer_id: 'stub-cust-3', name: 'Sohel Rana', registered_at: '2026-06-03T20:45:00Z' },
    ];
    return sample.slice(0, Math.max(0, limit));
  }
}
