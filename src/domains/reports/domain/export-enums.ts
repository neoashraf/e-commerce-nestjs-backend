/**
 * Export + scheduling vocabulary (RPT — FR-RPT-070/071, SRS 15 §8). Pure domain enums (no framework
 * imports) shared by the entities, DTOs (validation/Swagger), and the async export/cadence services.
 */

/** Output format of a generated export (SRS 15 §8 `ReportExport.format`). `csv` always; `pdf` where a printable layout exists. */
export enum ExportFormat {
  CSV = 'csv',
  PDF = 'pdf',
}

/** Lifecycle of an async export (SRS 15 §8 `ReportExport.status`). */
export enum ExportStatus {
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

/** Recurrence of a scheduled digest (SRS 15 §8 `ScheduledReport.cadence`). */
export enum ScheduleCadence {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

/**
 * Report families that can be exported / digested. Trace to the report endpoints in
 * `docs/api-contracts/15-reports.md`; the export `report_key` names the family (e.g. `sales`).
 */
export enum ReportKey {
  SALES = 'sales',
  ORDERS = 'orders',
  /** Row-level order list (one row per order) for the admin Orders page export — honours the list filters
   *  (status / payment_state / order-no search), distinct from `orders` which is the by-status summary. */
  ORDERS_LIST = 'orders_list',
  PRODUCTS = 'products',
  INVENTORY = 'inventory',
  CUSTOMERS = 'customers',
  PAYMENTS = 'payments',
  PROMOTIONS = 'promotions',
  SEARCH = 'search',
}

export const ALL_REPORT_KEYS: ReportKey[] = Object.values(ReportKey);

/** Whether a raw string is a known report family key. */
export function isReportKey(value: string): value is ReportKey {
  return (ALL_REPORT_KEYS as string[]).includes(value);
}
