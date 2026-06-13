/**
 * Outbound port: orders → catalog read seam for order-line presentation (RW6, rw6-order-confirmation-data).
 * Resolves an order item's `product_id` to the **current** catalog product's presentation bits the
 * confirmation/detail screen renders — a listing-rendition thumbnail and the optional Bangla title.
 * Snapshot fields (title/sku/price) stay on the order item; these are live, read-time lookups so the
 * confirmation can show a thumbnail without persisting it. Missing product (deleted) / no image → null.
 */
export interface ProductSnapshotView {
  /** Listing-rendition thumbnail URL (or original `url` fallback); null when none. */
  product_image: string | null;
  /** Bangla product title (`products.name_bn`); null when unset. */
  product_title_bn: string | null;
}

export interface IProductSnapshotReader {
  /** Batch-resolve presentation bits for a set of product ids (no N+1). Ids with no row are absent. */
  getByProductIds(productIds: string[]): Promise<Map<string, ProductSnapshotView>>;
}

export const PRODUCT_SNAPSHOT_READER = Symbol('OrdersIProductSnapshotReader');
