import { Injectable, Logger } from '@nestjs/common';

import { InventoryService } from '../../../inventory/application/inventory.service';
import {
  IInventoryAdminPort,
  InventoryVariantLevel,
} from '../../application/ports/inventory-admin.port';

/**
 * Admin INV adapter for catalog write-side variant work (FR-INV-002 + editor grid levels). Delegates
 * to INV; degrades gracefully (logs, never throws into catalog) so a transient INV issue never fails
 * variant generation or the product-detail read. Catalog never persists stock.
 */
@Injectable()
export class InventoryAdminAdapter implements IInventoryAdminPort {
  private readonly logger = new Logger(InventoryAdminAdapter.name);

  constructor(private readonly inventory: InventoryService) {}

  async ensureRecordForVariant(variantId: string, productId: string): Promise<void> {
    try {
      await this.inventory.ensureRecordForVariant(variantId, productId);
    } catch (err) {
      this.logger.warn(`ensureRecordForVariant failed for ${variantId}: ${String(err)}`);
    }
  }

  async getLevelsByVariantIds(
    variantIds: string[],
  ): Promise<Map<string, InventoryVariantLevel>> {
    const out = new Map<string, InventoryVariantLevel>();
    if (variantIds.length === 0) return out;
    try {
      const levels = await this.inventory.getLevelsByVariantIds(variantIds);
      for (const [id, l] of levels) {
        out.set(id, { on_hand: l.onHand, low_stock_threshold: l.lowStockThreshold });
      }
    } catch (err) {
      this.logger.warn(`INV levels lookup failed, defaulting to 0: ${String(err)}`);
    }
    return out;
  }
}
