import { Injectable, Logger } from '@nestjs/common';

import { InventoryService } from '../../../inventory/application/inventory.service';
import { IInventoryAvailabilityPort } from '../../application/ports/inventory-availability.port';
import { SearchAvailability } from '../../domain/search-enums';

/**
 * Live INV-availability adapter for SRCH (BR-SRCH-2). Delegates to INV's batched availability so a whole
 * page of products resolves in one call (no N+1). Degrades to `in_stock` if INV errors so listings still
 * render (§14 resilience). SRCH never persists stock truth — this only feeds the index mirror + ordering.
 */
@Injectable()
export class InventoryAvailabilityAdapter implements IInventoryAvailabilityPort {
  private readonly logger = new Logger(InventoryAvailabilityAdapter.name);

  constructor(private readonly inventory: InventoryService) {}

  async getAvailabilityByVariantIds(variantIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (variantIds.length === 0) return result;
    try {
      const availability = await this.inventory.batchAvailability(variantIds);
      for (const [variantId, entry] of Object.entries(availability)) {
        result.set(variantId, entry.status);
      }
    } catch (err) {
      this.logger.warn(`INV availability lookup failed, degrading to in_stock: ${String(err)}`);
      for (const id of variantIds) result.set(id, SearchAvailability.IN_STOCK);
    }
    return result;
  }
}
