import { Inject, Injectable } from '@nestjs/common';

import {
  CustomerDirectoryExportRow,
  CustomerDirectoryFilter,
  CUSTOMERS_READ_MODEL,
  ICustomersReadModel,
} from '../ports/customers-read.port';

/**
 * Row-level customer-directory export (one row per registered customer) backing the admin Customers page
 * export. Unlike {@link GetCustomersReportUseCase} (new-vs-returning / top-LTV summary), this returns the
 * same rows the admin directory shows, honouring the list filters (q / status / tag / last-order range).
 * Read-only over CUST via the read port (BR-RPT-5); not cached — an export reflects the live list at
 * request time and is bounded by the adapter's row cap.
 */
@Injectable()
export class GetCustomersListReportUseCase {
  constructor(@Inject(CUSTOMERS_READ_MODEL) private readonly customers: ICustomersReadModel) {}

  execute(filter: CustomerDirectoryFilter): Promise<CustomerDirectoryExportRow[]> {
    return this.customers.listDirectory(filter);
  }
}
