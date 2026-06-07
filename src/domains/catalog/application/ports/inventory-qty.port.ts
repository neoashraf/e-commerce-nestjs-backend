/**
 * Port the admin product list uses to join live on-hand `qty` from `INV` (FR-CAT-042, BR-CAT-5).
 * Catalog never stores stock. The implementation must DEGRADE GRACEFULLY — return an empty map (so
 * `qty` resolves to `null`) when `INV` is unavailable, never throwing into the catalog read path.
 */
export interface IInventoryQtyPort {
  /**
   * Resolve on-hand qty per product id (summed across the product's variants). Returns a map of
   * product_id → qty; products absent from the map render `qty: null`.
   */
  getQtyByProductIds(productIds: string[]): Promise<Map<string, number>>;
}

export const INVENTORY_QTY_PORT = Symbol('IInventoryQtyPort');
