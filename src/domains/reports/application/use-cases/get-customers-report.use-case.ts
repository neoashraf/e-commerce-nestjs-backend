import { Inject, Injectable } from '@nestjs/common';

import { ReportPeriod } from '../../domain/report-period';
import { CustomerView } from '../../domain/report-views';
import {
  CUSTOMERS_READ_MODEL,
  ICustomersReadModel,
  TopCustomerRow,
} from '../ports/customers-read.port';
import { ReportCacheService } from '../services/report-cache.service';

/** Full customer report payload (contract: Customer report) (FR-RPT-040/041). */
export interface CustomerReport {
  new_customers: number;
  returning_customers: number;
  repeat_rate: number;
  /** Populated for the `top_ltv` view; empty for `new_vs_returning`. */
  top: TopCustomerRow[];
  as_of: string;
}

/**
 * Customer report (FR-RPT-040/041, BR-RPT-8). Always reports new-vs-returning + repeat rate for the
 * period; the `top_ltv` view additionally returns the top customers by lifetime value. Reads CUST through
 * the port and serves from the aggregate cache with an `as_of` stamp (BR-RPT-7).
 */
@Injectable()
export class GetCustomersReportUseCase {
  constructor(
    @Inject(CUSTOMERS_READ_MODEL) private readonly customers: ICustomersReadModel,
    private readonly cache: ReportCacheService,
  ) {}

  async execute(
    period: ReportPeriod,
    view: CustomerView,
    topN: number,
  ): Promise<CustomerReport> {
    const range = { from: period.from, to: period.to };
    const key = `customers:${view}:${topN}:${period.from}:${period.to}`;

    const cached = await this.cache.getOrCompute(key, async () => {
      const [counts, top] = await Promise.all([
        this.customers.getNewVsReturning(range),
        view === CustomerView.TOP_LTV
          ? this.customers.getTopByLtv(range, topN)
          : Promise.resolve<TopCustomerRow[]>([]),
      ]);
      return { ...counts, top };
    });
    return { ...cached.value, as_of: cached.asOf };
  }
}
