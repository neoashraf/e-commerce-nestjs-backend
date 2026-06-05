/** The three stock states every read-side module (CAT/SRCH/CART/WISH) renders (FR-INV-004). */
export enum StockStatus {
  IN_STOCK = 'in_stock',
  LOW_STOCK = 'low_stock',
  OUT_OF_STOCK = 'out_of_stock',
}

/**
 * Single source-of-truth status deriver (FR-INV-004, BR-INV-7), reused by the batch availability
 * read and the admin list so the label is computed identically everywhere:
 *   out_of_stock  when available ≤ 0
 *   low_stock     when 0 < available ≤ low_stock_threshold
 *   in_stock      otherwise
 */
export function deriveStockStatus(available: number, lowStockThreshold: number): StockStatus {
  if (available <= 0) return StockStatus.OUT_OF_STOCK;
  if (available <= lowStockThreshold) return StockStatus.LOW_STOCK;
  return StockStatus.IN_STOCK;
}
