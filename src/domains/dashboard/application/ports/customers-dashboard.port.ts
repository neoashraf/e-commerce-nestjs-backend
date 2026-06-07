import { DateRange } from '../../domain/dashboard-period';
import { RecentCustomer } from '../../domain/summary.types';

/**
 * CUST read port (FR-DASH-001/021). New-customer count for the KPI and recent customers. Real
 * impl integrates with the Customers module read side. See the stub adapter for the
 * representative implementation pending wiring.
 */
export interface CustomersDashboardPort {
  /** Count of customers registered in the range (KPI new_customers). */
  getNewCustomerCount(range: DateRange): Promise<number>;
  /** Most recently registered customers (newest first). */
  getRecentCustomers(limit: number): Promise<RecentCustomer[]>;
}

export const CUSTOMERS_DASHBOARD_PORT = Symbol('DashboardCustomersPort');
