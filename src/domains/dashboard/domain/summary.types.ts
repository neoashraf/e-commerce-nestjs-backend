/**
 * Composed read-model types for the dashboard summary (SRS 10 §8 SummaryReadModel — conceptual,
 * not persisted). DASH owns no business data (BR-DASH-1/2); these shapes are assembled from the
 * owning modules via read ports and shaped to the API contract (snake_case at the DTO boundary).
 */

export type KpiDirection = 'up' | 'down' | 'flat';

/** A money KPI: value as a fixed-2 decimal string + BDT currency (BR-DASH-3, contract). */
export interface MoneyKpi {
  value: string;
  currency: 'BDT';
  /** Period-over-period change; `null` when the prior period is empty (§12.3 — show "—"). */
  delta_pct: number | null;
  direction: KpiDirection;
}

/** A count KPI: integer value + delta. */
export interface CountKpi {
  value: number;
  delta_pct: number | null;
  direction: KpiDirection;
}

export interface DashboardKpis {
  sales: MoneyKpi;
  orders: CountKpi;
  avg_order_value: MoneyKpi;
  new_customers: CountKpi;
}

/** Operational alert counts; sub-fields are omitted when the admin lacks the backing permission. */
export interface DashboardAlerts {
  orders_pending_payment?: number;
  orders_to_process?: number;
  orders_to_ship?: number;
  low_stock_skus?: number;
  out_of_stock_skus?: number;
  new_leads?: number;
}

export interface TrendPoint {
  date: string;
  sales: string;
  orders: number;
}

export interface TopProduct {
  product_id: string;
  title: string;
  units: number;
  sales: string;
}

export interface DashboardBreakdowns {
  trend: TrendPoint[];
  orders_by_status: Record<string, number>;
  payment_split: Record<string, number>;
  top_products: TopProduct[];
}

export interface RecentOrder {
  order_no: string;
  customer: string;
  grand_total: string;
  status: string;
  placed_at: string;
}

export interface RecentCustomer {
  customer_id: string;
  name: string;
  registered_at: string;
}

export interface RecentLead {
  lead_id: string;
  subject: string;
  status: string;
  created_at: string;
}

export interface PeriodView {
  preset: string;
  from: string;
  to: string;
  compare_from: string;
  compare_to: string;
}

/**
 * The full, **unfiltered** computed summary (the inline widgets — kpis/alerts/breakdowns).
 * Cached with `as_of`; the service then applies per-admin permission filtering before responding.
 * A widget value is `null` when its source failed to compute (§12.7 resilience — degrade only that
 * widget). The recent-activity widgets (`recent_orders`/`recent_customers`/`recent_leads`) are
 * advertised in `meta.visible_widgets` but their data is served on demand by the activity endpoint
 * (contract: `GET /admin/dashboard/activity`), not inlined here.
 */
export interface FullDashboardSummary {
  period: PeriodView;
  kpis: DashboardKpis | null;
  alerts: DashboardAlerts | null;
  breakdowns: DashboardBreakdowns | null;
  as_of: string;
}
