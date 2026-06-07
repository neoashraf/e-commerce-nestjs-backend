/**
 * View / dimension enums for the operational report families (RPT — FR-RPT-020–060). These are pure
 * domain vocabulary (no framework imports) shared by the DTOs (validation/Swagger) and the use cases.
 * Each report's allowed views/metrics trace to the API contract (`docs/api-contracts/15-reports.md`).
 */

/** Product report view (FR-RPT-020/021). */
export enum ProductView {
  TOP_SELLERS = 'top_sellers',
  BY_CATEGORY = 'by_category',
  SLOW_MOVERS = 'slow_movers',
}

/** Product ranking metric (FR-RPT-020) — rank top sellers by units or by revenue. */
export enum ProductMetric {
  UNITS = 'units',
  REVENUE = 'revenue',
}

/** Inventory report view (FR-RPT-030/031). */
export enum InventoryView {
  LEVELS = 'levels',
  LOW_STOCK = 'low_stock',
  OUT_OF_STOCK = 'out_of_stock',
  MOVEMENT = 'movement',
}

/** Customer report view (FR-RPT-040/041). */
export enum CustomerView {
  NEW_VS_RETURNING = 'new_vs_returning',
  TOP_LTV = 'top_ltv',
}

/** Search insights view (FR-RPT-060). */
export enum SearchView {
  POPULAR = 'popular',
  ZERO_RESULTS = 'zero_results',
}

/** Top-N ranking bounds (SRS 15 §11 validation: 1–100; default 10). */
export const DEFAULT_TOP_N = 10;
export const MIN_TOP_N = 1;
export const MAX_TOP_N = 100;
