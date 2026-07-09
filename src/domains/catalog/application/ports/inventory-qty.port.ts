/**
 * Port the admin product list/export uses to join live stock from `INV` (FR-CAT-042, BR-CAT-5).
 * Catalog never stores stock. The implementation must DEGRADE GRACEFULLY — return an empty map (so
 * `qty`/`qty_status` resolve to `null`) when `INV` is unavailable, never throwing into the catalog
 * read path.
 */

/** The three stock states surfaced on the admin list (FR-INV-004), or `null` when INV is unreachable. */
export type ProductQtyStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

/** Per-product live stock rollup: summed on-hand `qty` + the derived status label. */
export interface ProductStock {
  qty: number;
  qty_status: ProductQtyStatus;
}

export interface IInventoryQtyPort {
  /**
   * Resolve live stock per product id (summed across the product's variants): on-hand `qty` and the
   * derived `qty_status` (out_of_stock ≤ 0 < low_stock ≤ Σthreshold < in_stock). Returns a map of
   * product_id → {@link ProductStock}; products absent from the map render `qty`/`qty_status` as `null`.
   */
  getStockByProductIds(productIds: string[]): Promise<Map<string, ProductStock>>;
}

export const INVENTORY_QTY_PORT = Symbol('IInventoryQtyPort');
