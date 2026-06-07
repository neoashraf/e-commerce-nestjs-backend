import { ReportBucket, SalesBreakdown } from '../../domain/report-period';
import { ProductMetric } from '../../domain/report-views';

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

/** One product row of the product report (FR-RPT-020). Units/revenue come from order snapshots. */
export interface ProductSalesRow {
  product_id: string;
  /** Snapshot title from the order item (§12.10 — independent of current catalog state). */
  title: string;
  units: number;
  /** Σ line_total over paid/collected order items (BDT, 2dp string). */
  revenue: string;
}

/** One category row of the product report `by_category` view (FR-RPT-021). */
export interface CategorySalesRow {
  category_id: string;
  title: string;
  units: number;
  revenue: string;
}

/** Order-side payment figures for the payment report (FR-RPT-050); refunds come from the PAY port. */
export interface PaymentSplit {
  /** Count of paid/collected orders by payment method (cod/bkash/sslcommerz). */
  method_split: Record<string, number>;
  /** Σ grand_total of online-paid orders (BDT, 2dp string). */
  paid_online: string;
  /** Σ grand_total of COD-collected orders (BDT, 2dp string). */
  cod_collected: string;
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

  /** Top products by the chosen metric over paid/collected order items in the period (FR-RPT-020). */
  getTopProducts(range: ReportRange, metric: ProductMetric, topN: number): Promise<ProductSalesRow[]>;

  /** Paid/collected sales grouped by the product's current primary category (FR-RPT-021). */
  getSalesByCategory(range: ReportRange): Promise<CategorySalesRow[]>;

  /** Per-product units/revenue for every product sold in the period (drives slow-mover ranking). */
  getProductSalesMap(range: ReportRange): Promise<ProductSalesRow[]>;

  /** Payment method split + online-paid / COD-collected revenue for the period (FR-RPT-050). */
  getPaymentSplit(range: ReportRange): Promise<PaymentSplit>;
}

export const ORDERS_READ_MODEL = Symbol('IOrdersReadModel');
