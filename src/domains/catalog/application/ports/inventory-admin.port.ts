/**
 * Outbound port the catalog admin uses to talk to INV for write-side variant work:
 *  - auto-create a zero-stock inventory record when a variant is generated (FR-INV-002), so the
 *    variant is immediately stock-manageable + listable;
 *  - read on-hand levels for the product editor's variant grid.
 * The implementation degrades gracefully (never throws into the catalog path); stock lives only in INV.
 */
export interface InventoryVariantLevel {
  on_hand: number;
  low_stock_threshold: number;
}

export interface IInventoryAdminPort {
  /** Idempotently ensure a zero-stock inventory record exists for a newly created variant. */
  ensureRecordForVariant(variantId: string, productId: string): Promise<void>;
  /** Levels per variant id; ids without an inventory record are absent from the map. */
  getLevelsByVariantIds(variantIds: string[]): Promise<Map<string, InventoryVariantLevel>>;
}

export const INVENTORY_ADMIN_PORT = Symbol('IInventoryAdminPort');
