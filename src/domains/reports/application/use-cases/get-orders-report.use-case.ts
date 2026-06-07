import { Inject, Injectable } from '@nestjs/common';

import { ReportPeriod } from '../../domain/report-period';
import { IOrdersReadModel, ORDERS_READ_MODEL } from '../ports/orders-read.port';
import { ReportCacheService } from '../services/report-cache.service';
import { ratio } from '../services/money.util';

/** Per-status counts + value (FR-RPT-012). */
export interface OrdersStatusEntry {
  count: number;
  value: string;
}

/** Full orders report payload (contract: Orders report). */
export interface OrdersReport {
  by_status: Record<string, OrdersStatusEntry>;
  cancellation_rate: number;
  return_rate: number;
  as_of: string;
}

/**
 * Orders report (FR-RPT-012): placed-order counts and value by status, plus cancellation and return
 * (exchange) rates for the period. Read-only over ORD via the read port; cached with an `as_of` stamp.
 */
@Injectable()
export class GetOrdersReportUseCase {
  constructor(
    @Inject(ORDERS_READ_MODEL) private readonly orders: IOrdersReadModel,
    private readonly cache: ReportCacheService,
  ) {}

  async execute(period: ReportPeriod): Promise<OrdersReport> {
    const range = { from: period.from, to: period.to };
    const key = `orders:${period.from}:${period.to}`;

    const cached = await this.cache.getOrCompute(key, async () => {
      const [byStatusRows, rates] = await Promise.all([
        this.orders.getOrdersByStatus(range),
        this.orders.getOrderRateCounts(range),
      ]);

      const by_status: Record<string, OrdersStatusEntry> = {};
      for (const row of byStatusRows) {
        by_status[row.status] = { count: row.count, value: row.value };
      }

      return {
        by_status,
        cancellation_rate: ratio(rates.cancelled, rates.total),
        return_rate: ratio(rates.returned, rates.total),
      };
    });

    return { ...cached.value, as_of: cached.asOf };
  }
}
