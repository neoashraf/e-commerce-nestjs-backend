import { Injectable, Logger } from '@nestjs/common';

import { InventoryService } from '../../../inventory/application/inventory.service';
import {
  IInventoryStatusPort,
  VariantStock,
} from '../../application/ports/inventory-status.port';

/**
 * Live INV-status adapter for the storefront PDP (FR-CAT-042, BR-CAT-5/9). Delegates to INV's batched
 * availability so all of a product's variants resolve in one call (no N+1). If INV is unavailable it
 * degrades to `in_stock` so the PDP still renders (the FE shows the price block; OOS is only labelled
 * when INV genuinely reports it). Catalog never persists stock.
 */
@Injectable()
export class InventoryStatusAdapter implements IInventoryStatusPort {
  private readonly logger = new Logger(InventoryStatusAdapter.name);

  constructor(private readonly inventory: InventoryService) {}

  async getStatusByVariantIds(variantIds: string[]): Promise<Map<string, VariantStock>> {
    const result = new Map<string, VariantStock>();
    if (variantIds.length === 0) return result;
    try {
      const availability = await this.inventory.batchAvailability(variantIds);
      for (const [variantId, entry] of Object.entries(availability)) {
        result.set(variantId, { status: entry.status });
      }
    } catch (err) {
      this.logger.warn(`INV status lookup failed, degrading to in_stock: ${String(err)}`);
      for (const id of variantIds) result.set(id, { status: 'in_stock' });
    }
    return result;
  }
}
