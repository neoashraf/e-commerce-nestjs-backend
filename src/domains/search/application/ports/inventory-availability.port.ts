/**
 * Port SRCH uses for LIVE availability from INV (BR-SRCH-2). One batched lookup per result page keyed
 * by `variant_id` (no N+1, §14). SRCH stores an availability mirror on the index for fast sort/filter,
 * refreshed by the reindex hook; this port is the truth source the indexer + (optionally) the query
 * path read. Backed by `InventoryAvailabilityAdapter`; if INV is unavailable it degrades to `in_stock`
 * so listings still render.
 */
export interface IInventoryAvailabilityPort {
  /** Resolve `in_stock|low_stock|out_of_stock` per variant id in one call. Missing → out_of_stock. */
  getAvailabilityByVariantIds(variantIds: string[]): Promise<Map<string, string>>;
}

export const INVENTORY_AVAILABILITY_PORT = Symbol('IInventoryAvailabilityPort');
