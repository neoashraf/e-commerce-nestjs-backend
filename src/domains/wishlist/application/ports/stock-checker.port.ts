import { Injectable } from '@nestjs/common';

import { InventoryService } from '../../../inventory/application/inventory.service';

export type WishlistStockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export interface StockAvailability {
  available: number;
  status: WishlistStockStatus;
}

/**
 * Outbound port to INV for live stock (BR-WISH-2, FR-WISH-011/022). The wishlist never stores stock —
 * availability per item and the move-to-cart eligibility re-check read it here. Real impl = inv-stock-be.
 */
export interface IStockChecker {
  /** Batched availability for a set of variants (view path — no N+1). */
  availabilityFor(variantIds: string[]): Promise<Map<string, StockAvailability>>;
  /** Single-variant available units (move-to-cart re-check). */
  availableFor(variantId: string): Promise<number>;
}

export const STOCK_CHECKER = Symbol('WishlistIStockChecker');

/** INV-backed adapter: wraps `InventoryService.batchAvailability` (WISH never touches INV infra). */
@Injectable()
export class InventoryStockChecker implements IStockChecker {
  constructor(private readonly inventory: InventoryService) {}

  async availabilityFor(variantIds: string[]): Promise<Map<string, StockAvailability>> {
    const map = new Map<string, StockAvailability>();
    const unique = Array.from(new Set(variantIds));
    if (unique.length === 0) return map;
    const result = await this.inventory.batchAvailability(unique);
    for (const id of unique) {
      const entry = result[id];
      map.set(id, {
        available: entry?.available ?? 0,
        status: (entry?.status as WishlistStockStatus) ?? 'out_of_stock',
      });
    }
    return map;
  }

  async availableFor(variantId: string): Promise<number> {
    const map = await this.availabilityFor([variantId]);
    return map.get(variantId)?.available ?? 0;
  }
}
