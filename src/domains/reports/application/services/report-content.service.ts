import { Injectable } from '@nestjs/common';

import { InventoryView } from '../../domain/report-views';
import { ReportKey } from '../../domain/export-enums';
import { GetSalesReportUseCase } from '../use-cases/get-sales-report.use-case';
import { GetOrdersReportUseCase } from '../use-cases/get-orders-report.use-case';
import { GetOrdersListReportUseCase } from '../use-cases/get-orders-list-report.use-case';
import { GetProductReportUseCase } from '../use-cases/get-product-report.use-case';
import { GetInventoryReportUseCase } from '../use-cases/get-inventory-report.use-case';
import { GetCustomersReportUseCase } from '../use-cases/get-customers-report.use-case';
import { GetPaymentsReportUseCase } from '../use-cases/get-payments-report.use-case';
import { GetPromotionsReportUseCase } from '../use-cases/get-promotions-report.use-case';
import { GetSearchReportUseCase } from '../use-cases/get-search-report.use-case';
import {
  paramReaders,
  RawReportParams,
  resolvePeriod,
  resolveTopN,
} from './report-params';

/** A flattened, tabular report ready for CSV/PDF serialisation. Money/values are already display strings. */
export interface ReportTable {
  title: string;
  columns: string[];
  rows: Array<Record<string, string | number>>;
  as_of: string;
}

type Row = Record<string, string | number>;

/** Derive an ordered column set from the union of row keys (preserving first-seen order). */
function columnsOf(rows: Row[], preferred: string[] = []): string[] {
  const seen = new Set<string>(preferred);
  for (const row of rows) for (const k of Object.keys(row)) seen.add(k);
  return [...seen];
}

/**
 * Renders a named report family (FR-RPT-010–060) to a flat table for export/digest (FR-RPT-070/071).
 * Reuses the existing report use-cases verbatim (no recomputation, no source mutation — BR-RPT-5), so an
 * export reconciles exactly with the in-app report (NFR consistency). Object-shaped reports (sales totals,
 * orders-by-status, customer/payment summaries, inventory movement) are pivoted into rows; list reports
 * pass through. The `as_of` freshness stamp is carried into the export.
 */
@Injectable()
export class ReportContentService {
  constructor(
    private readonly sales: GetSalesReportUseCase,
    private readonly orders: GetOrdersReportUseCase,
    private readonly ordersList: GetOrdersListReportUseCase,
    private readonly products: GetProductReportUseCase,
    private readonly inventory: GetInventoryReportUseCase,
    private readonly customers: GetCustomersReportUseCase,
    private readonly payments: GetPaymentsReportUseCase,
    private readonly promotions: GetPromotionsReportUseCase,
    private readonly search: GetSearchReportUseCase,
  ) {}

  async render(reportKey: ReportKey, params: RawReportParams, now: Date): Promise<ReportTable> {
    switch (reportKey) {
      case ReportKey.SALES:
        return this.renderSales(params, now);
      case ReportKey.ORDERS:
        return this.renderOrders(params, now);
      case ReportKey.ORDERS_LIST:
        return this.renderOrdersList(params, now);
      case ReportKey.PRODUCTS:
        return this.renderProducts(params, now);
      case ReportKey.INVENTORY:
        return this.renderInventory(params, now);
      case ReportKey.CUSTOMERS:
        return this.renderCustomers(params, now);
      case ReportKey.PAYMENTS:
        return this.renderPayments(params, now);
      case ReportKey.PROMOTIONS:
        return this.renderPromotions(params, now);
      case ReportKey.SEARCH:
        return this.renderSearch(params, now);
    }
  }

  private async renderSales(params: RawReportParams, now: Date): Promise<ReportTable> {
    const period = resolvePeriod(params, now);
    const report = await this.sales.execute(period, paramReaders.salesBreakdown(params));
    const rows: Row[] = report.series.map((s) => ({
      bucket: s.bucket,
      net_revenue: s.net_revenue,
      orders: s.orders,
      units: s.units,
      aov: s.aov,
    }));
    rows.push({
      bucket: 'TOTAL',
      net_revenue: report.totals.net_revenue,
      orders: report.totals.orders,
      units: report.totals.units,
      aov: report.totals.aov,
    });
    return {
      title: `Sales (${period.from} → ${period.to})`,
      columns: ['bucket', 'net_revenue', 'orders', 'units', 'aov'],
      rows,
      as_of: report.as_of,
    };
  }

  private async renderOrders(params: RawReportParams, now: Date): Promise<ReportTable> {
    const period = resolvePeriod(params, now);
    const report = await this.orders.execute(period);
    const rows: Row[] = Object.entries(report.by_status).map(([status, entry]) => ({
      status,
      count: entry.count,
      value: entry.value,
    }));
    rows.push({ status: 'cancellation_rate', count: report.cancellation_rate, value: '' });
    rows.push({ status: 'return_rate', count: report.return_rate, value: '' });
    return {
      title: `Orders (${period.from} → ${period.to})`,
      columns: ['status', 'count', 'value'],
      rows,
      as_of: report.as_of,
    };
  }

  /**
   * Row-level order list (one row per order) for the Orders-page export. No period default — it honours
   * the admin list filters (status / payment_state / order-no `q`) passed through the export params, so the
   * file matches exactly what the list shows. Optional `from`/`to` narrow by placed-at if supplied.
   */
  private async renderOrdersList(params: RawReportParams, now: Date): Promise<ReportTable> {
    const str = (value: unknown): string | undefined =>
      typeof value === 'string' && value.trim() !== '' ? value : undefined;
    const rows = await this.ordersList.execute({
      status: str(params.status),
      paymentState: str(params.payment_state),
      q: str(params.q),
      from: str(params.from),
      to: str(params.to),
    });
    return {
      title: 'Orders',
      columns: [
        'order_no',
        'customer',
        'phone',
        'status',
        'payment_method',
        'payment_state',
        'grand_total',
        'placed_at',
      ],
      rows: rows as unknown as Row[],
      as_of: new Date(now).toISOString(),
    };
  }

  private async renderProducts(params: RawReportParams, now: Date): Promise<ReportTable> {
    const period = resolvePeriod(params, now);
    const data = await this.products.execute(
      period,
      paramReaders.productView(params),
      paramReaders.productMetric(params),
      resolveTopN(params),
    );
    const rows = data as unknown as Row[];
    return {
      title: `Products (${period.from} → ${period.to})`,
      columns: columnsOf(rows),
      rows,
      as_of: new Date(now).toISOString(),
    };
  }

  private async renderInventory(params: RawReportParams, now: Date): Promise<ReportTable> {
    const view = paramReaders.inventoryView(params);
    if (view === InventoryView.MOVEMENT) {
      const period = resolvePeriod(params, now);
      const movement = await this.inventory.movement(period);
      const { as_of, ...metrics } = movement;
      const rows: Row[] = Object.entries(metrics).map(([metric, value]) => ({
        metric,
        value: value as number,
      }));
      return { title: 'Inventory movement', columns: ['metric', 'value'], rows, as_of };
    }
    const levels = (await this.inventory.levels(view)) as unknown as Row[];
    return {
      title: `Inventory (${view})`,
      columns: columnsOf(levels),
      rows: levels,
      as_of: new Date(now).toISOString(),
    };
  }

  private async renderCustomers(params: RawReportParams, now: Date): Promise<ReportTable> {
    const period = resolvePeriod(params, now);
    const report = await this.customers.execute(period, paramReaders.customerView(params), resolveTopN(params));
    const rows: Row[] = [
      { metric: 'new_customers', value: report.new_customers ?? 0 },
      { metric: 'returning_customers', value: report.returning_customers ?? 0 },
      { metric: 'repeat_rate', value: report.repeat_rate ?? 0 },
    ];
    for (const t of report.top ?? []) {
      rows.push({ metric: `ltv:${t.name}`, value: t.ltv });
    }
    return {
      title: `Customers (${period.from} → ${period.to})`,
      columns: ['metric', 'value'],
      rows,
      as_of: report.as_of,
    };
  }

  private async renderPayments(params: RawReportParams, now: Date): Promise<ReportTable> {
    const period = resolvePeriod(params, now);
    const report = await this.payments.execute(period);
    const rows: Row[] = [
      ...Object.entries(report.method_split).map(([method, count]) => ({
        metric: `orders:${method}`,
        value: count as number,
      })),
      { metric: 'paid_online', value: report.paid_online },
      { metric: 'cod_collected', value: report.cod_collected },
      { metric: 'refunds', value: report.refunds },
    ];
    return {
      title: `Payments (${period.from} → ${period.to})`,
      columns: ['metric', 'value'],
      rows,
      as_of: report.as_of,
    };
  }

  private async renderPromotions(params: RawReportParams, now: Date): Promise<ReportTable> {
    const period = resolvePeriod(params, now);
    const data = (await this.promotions.execute(period)) as unknown as Row[];
    return {
      title: `Promotions (${period.from} → ${period.to})`,
      columns: columnsOf(data, ['coupon_code', 'redemptions', 'discount_given', 'attributed_sales']),
      rows: data,
      as_of: new Date(now).toISOString(),
    };
  }

  private async renderSearch(params: RawReportParams, now: Date): Promise<ReportTable> {
    const period = resolvePeriod(params, now);
    const data = (await this.search.execute(period, paramReaders.searchView(params), resolveTopN(params))) as unknown as Row[];
    return {
      title: `Search insights (${period.from} → ${period.to})`,
      columns: columnsOf(data, ['query', 'occurrences', 'result_count']),
      rows: data,
      as_of: new Date(now).toISOString(),
    };
  }
}
