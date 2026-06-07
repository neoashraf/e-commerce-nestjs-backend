import { Inject, Injectable } from '@nestjs/common';

import { ReportPeriod } from '../../domain/report-period';
import { IOrdersReadModel, ORDERS_READ_MODEL } from '../ports/orders-read.port';
import { IPaymentsReadModel, PAYMENTS_READ_MODEL } from '../ports/payments-read.port';
import { ReportCacheService } from '../services/report-cache.service';

/** Full payment report payload (contract: Payment report) (FR-RPT-050). */
export interface PaymentReport {
  method_split: Record<string, number>;
  paid_online: string;
  cod_collected: string;
  refunds: string;
  as_of: string;
}

/**
 * Payment report (FR-RPT-050): payment-method split + online-paid / COD-collected revenue (from ORD) and
 * completed-refund total (from PAY), for the period. Reads both through ports and serves from the
 * aggregate cache with an `as_of` stamp (BR-RPT-7).
 */
@Injectable()
export class GetPaymentsReportUseCase {
  constructor(
    @Inject(ORDERS_READ_MODEL) private readonly orders: IOrdersReadModel,
    @Inject(PAYMENTS_READ_MODEL) private readonly payments: IPaymentsReadModel,
    private readonly cache: ReportCacheService,
  ) {}

  async execute(period: ReportPeriod): Promise<PaymentReport> {
    const range = { from: period.from, to: period.to };
    const key = `payments:${period.from}:${period.to}`;

    const cached = await this.cache.getOrCompute(key, async () => {
      const [split, refunds] = await Promise.all([
        this.orders.getPaymentSplit(range),
        this.payments.getRefundsTotal(range),
      ]);
      return {
        method_split: split.method_split,
        paid_online: split.paid_online,
        cod_collected: split.cod_collected,
        refunds,
      };
    });
    return { ...cached.value, as_of: cached.asOf };
  }
}
