import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { IInventoryQtyPort } from '../../application/ports/inventory-qty.port';

/**
 * INV-qty adapter for the admin product list (FR-CAT-042). Sums `INV.inventory.on_hand` per product
 * across its variants. DEGRADES GRACEFULLY: until the `inventory` table lands (catalog-variants-be →
 * inv-stock-be), or if the join fails for any reason, it returns an empty map so `qty` renders `null`
 * rather than blocking the catalog read. Once INV ships its table this lights up automatically.
 */
@Injectable()
export class InventoryQtyAdapter implements IInventoryQtyPort {
  private readonly logger = new Logger(InventoryQtyAdapter.name);

  constructor(private readonly dataSource: DataSource) {}

  async getQtyByProductIds(productIds: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (productIds.length === 0) return result;

    try {
      const hasInventory = await this.tableExists('inventory');
      const hasVariants = await this.tableExists('product_variants');
      if (!hasInventory || !hasVariants) return result;

      const rows = await this.dataSource.query(
        `SELECT pv."product_id" AS product_id, COALESCE(SUM(inv."on_hand"), 0)::int AS qty
           FROM "product_variants" pv
           JOIN "inventory" inv ON inv."variant_id" = pv."id"
          WHERE pv."product_id" = ANY($1) AND pv."deleted_at" IS NULL
          GROUP BY pv."product_id"`,
        [productIds],
      );
      for (const r of rows as { product_id: string; qty: number }[]) {
        result.set(r.product_id, r.qty);
      }
    } catch (err) {
      // Never block the catalog list on an INV hiccup — degrade to "no qty".
      this.logger.warn(`INV qty join unavailable, degrading to null qty: ${String(err)}`);
      return new Map<string, number>();
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
