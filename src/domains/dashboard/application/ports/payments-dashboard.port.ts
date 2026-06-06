import { DateRange } from '../../domain/dashboard-period';

/**
 * PAY read port (FR-DASH-001/022, BR-DASH-3). Paid-online + COD-collected revenue for the sales
 * KPI, and the payment-method split breakdown. Real impl integrates with the Payments module
 * read side. See the stub adapter for the representative implementation pending wiring.
 */
export interface PaymentsDashboardPort {
  /** Net paid (online `paid`) + `cod_collected` revenue in the range, in BDT (BR-DASH-3). */
  getRevenue(range: DateRange): Promise<number>;
  /** Order/payment counts by method (e.g. cod / bkash / sslcommerz) in the range. */
  getPaymentSplit(range: DateRange): Promise<Record<string, number>>;
}

export const PAYMENTS_DASHBOARD_PORT = Symbol('DashboardPaymentsPort');
