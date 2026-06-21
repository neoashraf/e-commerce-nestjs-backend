import { ReportRange } from './orders-read.port';

/** New-vs-returning split for the period (FR-RPT-040, BR-RPT-8). */
export interface NewVsReturning {
  new_customers: number;
  returning_customers: number;
  /** returning / (new + returning); 0 when neither (contract: 0.42). */
  repeat_rate: number;
}

/** One top-LTV customer row (FR-RPT-041). */
export interface TopCustomerRow {
  customer_id: string;
  name: string;
  /** Lifetime paid/collected order value (BDT, 2dp string). */
  ltv: string;
  /** Lifetime count of paid/collected orders. */
  orders: number;
}

/** Filters for the customer-directory export — mirrors the admin Customers list (FR-CUST-040). */
export interface CustomerDirectoryFilter {
  /** Free-text over name / phone / email. */
  q?: string;
  /** Account status (active / locked / suspended / deleted). */
  status?: string;
  /** Customer-tag key. */
  tag?: string;
  /** Last-order placed-at lower / upper bound (ISO date). */
  lastOrderFrom?: string;
  lastOrderTo?: string;
}

/** One row of the customer-directory export (registered customers; non-sensitive fields only — §11/§14). */
export interface CustomerDirectoryExportRow {
  customer_id: string;
  full_name: string;
  phone: string;
  email: string;
  status: string;
  order_count: number;
  /** Lifetime paid/collected order value (BDT, 2dp string). */
  total_spent: string;
  /** Last paid/collected order time (ISO datetime), or empty. */
  last_order_at: string;
}

/**
 * Read-only view RPT takes over CUST (customer aggregates). Definitions are the *shared* ones DASH/CUST
 * reuse (BR-RPT-1/8): a "completed" order is one in a revenue state (online `paid` / COD `cod_collected`);
 * a returning customer has ≥ 1 prior completed order *before* the period's order. Read-side only
 * (BR-RPT-5); decoupled from CUST/AUTH ORM classes — implemented over the `customers`/`orders` tables.
 */
export interface ICustomersReadModel {
  /** New vs returning customers + repeat rate for the period (FR-RPT-040). */
  getNewVsReturning(range: ReportRange): Promise<NewVsReturning>;

  /** Top customers by lifetime value, capped at `topN` (FR-RPT-041). */
  getTopByLtv(range: ReportRange, topN: number): Promise<TopCustomerRow[]>;

  /** Row-level customer directory matching the list filters, for the Customers export (FR-RPT-070 / FR-CUST-040). */
  listDirectory(filter: CustomerDirectoryFilter): Promise<CustomerDirectoryExportRow[]>;
}

export const CUSTOMERS_READ_MODEL = Symbol('ICustomersReadModel');
