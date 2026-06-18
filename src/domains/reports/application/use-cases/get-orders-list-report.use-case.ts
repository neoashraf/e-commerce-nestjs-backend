import { Inject, Injectable } from '@nestjs/common';

import {
  IOrdersReadModel,
  OrderListExportRow,
  OrderListFilters,
  ORDERS_READ_MODEL,
} from '../ports/orders-read.port';

/**
 * Row-level order-list export (one row per order) backing the admin Orders page CSV/PDF export. Unlike
 * {@link GetOrdersReportUseCase} (by-status summary), this returns the same rows the admin list shows,
 * honouring the list filters (status / payment_state / order-no search). Read-only over ORD via the read
 * port (BR-RPT-5); not cached — an export reflects the live list at request time and is bounded by the
 * adapter's row cap.
 */
@Injectable()
export class GetOrdersListReportUseCase {
  constructor(@Inject(ORDERS_READ_MODEL) private readonly orders: IOrdersReadModel) {}

  execute(filters: OrderListFilters): Promise<OrderListExportRow[]> {
    return this.orders.listOrders(filters);
  }
}
