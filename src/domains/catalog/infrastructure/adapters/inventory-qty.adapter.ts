import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
  IInventoryQtyPort,
  ProductQtyStatus,
  ProductStock,
} from '../../application/ports/inventory-qty.port';

/**
 * INV-stock adapter for the admin product list/export (FR-CAT-042). Sums `INV.inventory` per product
 * across its variants — `on_hand` for `qty`, and `available`/`low_stock_threshold` for the derived
 * `qty_status`. DEGRADES GRACEFULLY: until the `inventory` table lands, or if the join fails for any
 * reason, it returns an empty map so `qty`/`qty_status` render `null` rather than blocking the catalog
 * read. Once INV ships its table this lights up automatically.
 */
@Injectable()
export class InventoryQtyAdapter implements IInventoryQtyPort {
  private readonly logger = new Logger(InventoryQtyAdapter.name);

  constructor(private readonly dataSource: DataSource) {}

  async getStockByProductIds(productIds: string[]): Promise<Map<string, ProductStock>> {
    const result = new Map<string, ProductStock>();
    if (productIds.length === 0) return result;

    try {
      const hasInventory = await this.tableExists('inventory');
      const hasVariants = await this.tableExists('product_variants');
      if (!hasInventory || !hasVariants) return result;

      const rows = await this.dataSource.query(
        `SELECT pv."product_id" AS product_id,
                COALESCE(SUM(inv."on_hand"), 0)::int AS qty,
                COALESCE(SUM(inv."available"), 0)::int AS available,
                COALESCE(SUM(inv."low_stock_threshold"), 0)::int AS threshold
           FROM "product_variants" pv
           JOIN "inventory" inv ON inv."variant_id" = pv."id"
          WHERE pv."product_id" = ANY($1) AND pv."deleted_at" IS NULL
          GROUP BY pv."product_id"`,
        [productIds],
      );
      for (const r of rows as { product_id: string; qty: number; available: number; threshold: number }[]) {
        result.set(r.product_id, { qty: r.qty, qty_status: deriveStatus(r.available, r.threshold) });
      }
    } catch (err) {
      // Never block the catalog list on an INV hiccup — degrade to "no stock".
      this.logger.warn(`INV stock join unavailable, degrading to null qty: ${String(err)}`);
      return new Map<string, ProductStock>();
    }

    return result;
  }

  private async tableExists(table: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 LIMIT 1`,
      [table],
    );
    return rows.length > 0;
  }
}

/** Mirror of INV's `deriveStockStatus` (FR-INV-004): out_of_stock ≤ 0 < low_stock ≤ threshold < in_stock. */
function deriveStatus(available: number, threshold: number): ProductQtyStatus {
  if (available <= 0) return 'out_of_stock';
  if (available <= threshold) return 'low_stock';
  return 'in_stock';
}
