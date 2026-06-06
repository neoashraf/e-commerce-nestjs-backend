import { ReportRange } from './orders-read.port';

/** Derived stock status (INV §: from available vs low-stock threshold). */
export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

/** One per-SKU stock row for the inventory `levels`/`low_stock`/`out_of_stock` views (FR-RPT-030). */
export interface StockLevelRow {
  variant_id: string;
  product_id: string;
  sku_code: string;
  product_title: string;
  on_hand: number;
  reserved: number;
  available: number;
  low_stock_threshold: number;
  status: StockStatus;
}

/** Period stock-movement summary by type (FR-RPT-031). Signed where natural (adjusted may be negative). */
export interface MovementSummary {
  received: number;
  sold: number;
  adjusted: number;
  restocked: number;
}

/** A product that currently holds stock on hand — input to the product report's slow-mover ranking. */
export interface ProductStockRow {
  product_id: string;
  title: string;
  on_hand: number;
}

/** Which stock list the `levels` family of views returns. */
export type StockLevelFilter = 'all' | 'low_stock' | 'out_of_stock';

/**
 * Read-only view RPT takes over INV (stock + movement ledger). Read-side only — no mutation (BR-RPT-5).
 * Stock status is derived from `available` vs `low_stock_threshold`; movement is summarised from the
 * append-only `stock_movements` ledger, attributed to the platform timezone day (BR-RPT-4). Implemented
 * by an adapter over the inventory tables (stubbable in tests); CUST/PROMO/SRCH ports follow the same shape.
 */
export interface IInventoryReadModel {
  /** Per-SKU stock rows, optionally filtered to low-stock or out-of-stock only (FR-RPT-030). */
  getStockLevels(filter: StockLevelFilter): Promise<StockLevelRow[]>;

  /** Movement totals for the period grouped into received/sold/adjusted/restocked (FR-RPT-031). */
  getMovementSummary(range: ReportRange): Promise<MovementSummary>;

  /** Every product with `on_hand > 0` plus its title — used to surface unsold stock as slow movers. */
  getProductsWithStock(): Promise<ProductStockRow[]>;
}

export const INVENTORY_READ_MODEL = Symbol('IInventoryReadModel');
