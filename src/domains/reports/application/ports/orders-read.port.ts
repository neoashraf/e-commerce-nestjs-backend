import { ReportBucket, SalesBreakdown } from '../../domain/report-period';

/** Range filter shared by the read-model queries. Inclusive `[from, to]` Asia/Dhaka calendar days. */
export interface ReportRange {
  from: string;
  to: string;
}

/** One time-series row of paid/collected order activity, keyed by the bucket's start day. */
export interface PaidOrdersBucketRow {
  /** Bucket start as `YYYY-MM-DD` (Asia/Dhaka). */
  bucket: string;
  /** Σ grand_total of paid/collected orders in the bucket (BDT, 2dp string). */
  revenue: string;
  /** Count of paid/collected orders in the bucket. */
  orders: number;
  /** Σ units (order_item.quantity) in the bucket. */
  units: number;
}

/** Period totals over paid/collected orders + the distinct gross-placed figure (BR-RPT-2/3). */
export interface PaidOrdersTotals {
  revenue: string;
  gross_placed_value: string;
  orders: number;
  units: number;
}

/** One status row of the orders report (FR-RPT-012). */
export interface OrdersByStatusRow {
  status: string;
  count: number;
  value: string;
}

/** Counts used to derive cancellation/return rates for the period (FR-RPT-012). */
export interface OrderRateCounts {
  total: number;
  cancelled: number;
  returned: number;
}

/**
 * Read-only view RPT takes over ORD (orders/items). Read-side only — no mutation (BR-RPT-5). Revenue
 * is attributed by `placed_at`; an order counts toward revenue when its payment_state is `paid` or
 * `cod_collected` (BR-RPT-2). Implemented by an adapter over the orders tables (stubbable in tests).
 */
export interface IOrdersReadModel {
  /** Paid/collected order revenue/orders/units bucketed by day/week/month (Asia/Dhaka). */
  getPaidOrdersSeries(range: ReportRange, bucket: ReportBucket): Promise<PaidOrdersBucketRow[]>;

  /** Period totals: paid/collected revenue/orders/units + gross placed value (all placed orders). */
  getPaidOrdersTotals(range: ReportRange): Promise<PaidOrdersTotals>;

  /** Paid/collected revenue grouped by a sales dimension (category / delivery_zone / payment_method). */
  getSalesBreakdown(range: ReportRange, dimension: SalesBreakdown): Promise<Record<string, string>>;

  /** All orders placed in the period grouped by status: count + Σ grand_total (FR-RPT-012). */
  getOrdersByStatus(range: ReportRange): Promise<OrdersByStatusRow[]>;

  /** Total / cancelled / returned(exchanged) placed-order counts for the rate calculation. */
  getOrderRateCounts(range: ReportRange): Promise<OrderRateCounts>;
}

export const ORDERS_READ_MODEL = Symbol('IOrdersReadModel');
