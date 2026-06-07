import { Injectable } from '@nestjs/common';

import { InventoryService } from '../../../inventory/application/inventory.service';

/** Live stock availability for a set of variants (INV re-check, FR-CART-003). */
export interface StockAvailability {
  available: number;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
}

/**
 * Outbound port to INV for the live cart stock re-check (FR-CART-003, BR-CART-2). The cart never stores
 * stock; add/update/merge cap quantities at `available` via this seam. Real impl = inv-stock-be.
 */
export interface IStockChecker {
  availabilityFor(variantIds: string[]): Promise<Map<string, StockAvailability>>;
  availableFor(variantId: string): Promise<number>;
}

export const STOCK_CHECKER = Symbol('IStockChecker');

/** INV-backed adapter: wraps `InventoryService.batchAvailability` (cart never touches INV infra). */
@Injectable()
export class InventoryStockChecker implements IStockChecker {
  constructor(private readonly inventory: InventoryService) {}

  async availabilityFor(variantIds: string[]): Promise<Map<string, StockAvailability>> {
    const map = new Map<string, StockAvailability>();
    if (variantIds.length === 0) return map;
    const result = await this.inventory.batchAvailability(variantIds);
    for (const id of variantIds) {
      const entry = result[id];
      map.set(id, {
        available: entry?.available ?? 0,
        status: (entry?.status as StockAvailability['status']) ?? 'out_of_stock',
      });
    }
    return map;
  }

  async availableFor(variantId: string): Promise<number> {
    const map = await this.availabilityFor([variantId]);
    return map.get(variantId)?.available ?? 0;
  }
}
