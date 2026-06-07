import { Injectable } from '@nestjs/common';

import { DateRange } from '../../domain/dashboard-period';
import { RecentCustomer } from '../../domain/summary.types';
import { CustomersDashboardPort } from '../../application/ports/customers-dashboard.port';
import { daySeed, eachDay } from './stub-data.util';

/**
 * CUST read-port stub (FR-DASH-001/021). Representative new-customer count and recent customers.
 *
 * TODO-INTEGRATION (CUST): replace with a real adapter over the Customers module read side —
 * count accounts registered in the range and list the most recent registrations.
 */
@Injectable()
export class CustomersDashboardStubAdapter implements CustomersDashboardPort {
  async getNewCustomerCount(range: DateRange): Promise<number> {
    return eachDay(range).reduce((sum, day) => sum + 3 + (daySeed(day) % 4), 0);
  }

  async getRecentCustomers(limit: number): Promise<RecentCustomer[]> {
    const sample: RecentCustomer[] = [
      { customer_id: 'stub-cust-1', name: 'Imran Chowdhury', registered_at: '2026-06-04T08:20:00Z' },
      { customer_id: 'stub-cust-2', name: 'Farzana Akter', registered_at: '2026-06-04T07:05:00Z' },
      { customer_id: 'stub-cust-3', name: 'Sohel Rana', registered_at: '2026-06-03T20:45:00Z' },
    ];
    return sample.slice(0, Math.max(0, limit));
  }
}
