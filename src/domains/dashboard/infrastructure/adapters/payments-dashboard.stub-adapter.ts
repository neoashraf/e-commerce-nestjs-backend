import { Injectable } from '@nestjs/common';

import { DateRange } from '../../domain/dashboard-period';
import { PaymentsDashboardPort } from '../../application/ports/payments-dashboard.port';
import { dailyOrders, dailyRevenue, eachDay } from './stub-data.util';

/**
 * PAY read-port stub (FR-DASH-001/022, BR-DASH-3). Representative paid/collected revenue and
 * payment-method split.
 *
 * TODO-INTEGRATION (PAY): replace with a real adapter over the Payments module read side — sum of
 * online `paid` + `cod_collected` amounts (BR-DASH-3), and a count split by gateway.
 */
@Injectable()
export class PaymentsDashboardStubAdapter implements PaymentsDashboardPort {
  async getRevenue(range: DateRange): Promise<number> {
    return eachDay(range).reduce((sum, day) => sum + dailyRevenue(day), 0);
  }

  async getPaymentSplit(range: DateRange): Promise<Record<string, number>> {
    const total = eachDay(range).reduce((sum, day) => sum + dailyOrders(day), 0);
    return {
      cod: Math.round(total * 0.55),
      bkash: Math.round(total * 0.3),
      sslcommerz: Math.round(total * 0.15),
    };
  }
}
