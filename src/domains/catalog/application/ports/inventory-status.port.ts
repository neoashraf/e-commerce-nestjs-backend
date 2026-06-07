/**
 * Port the storefront PDP read-model uses for LIVE per-variant stock status from `INV` (FR-CAT-042,
 * BR-CAT-5/9). One batched lookup for all of a product's variant ids; stock is NEVER stored on
 * Catalog. Backed by `InventoryStatusAdapter` (delegates to INV's batch availability); a stub
 * fallback returns `in_stock` so the PDP renders even before INV is wired.
 */
export interface VariantStock {
  /** `in_stock` | `low_stock` | `out_of_stock` (from INV's per-SKU threshold). */
  status: string;
}

export interface IInventoryStatusPort {
  /** Resolve stock status per variant id in one batched call. Missing ids → out_of_stock. */
  getStatusByVariantIds(variantIds: string[]): Promise<Map<string, VariantStock>>;
}

export const INVENTORY_STATUS_PORT = Symbol('IInventoryStatusPort');
