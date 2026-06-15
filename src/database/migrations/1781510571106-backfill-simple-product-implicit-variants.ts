import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CAT/INV (FR-CAT-025, FR-INV-002): backfill the implicit variant + zero-stock inventory record for
 * every existing (non-deleted) SIMPLE product that has no variant at all. A simple product "is
 * treated as a single implicit variant carrying the product SKU", but products created through the
 * admin create flow before that wiring got only a `products` row — so they had no SKU/inventory and
 * were invisible on the Stock page (and unsellable). The implicit variant carries the product SKU,
 * has no option rows, and is enabled. Idempotent (NOT EXISTS guard); no down (inventory + variant
 * ids are owned data consumed by INV/CART/ORD and must never be deleted on rollback).
 * Real system-clock epoch (> backfill-variant-inventory-records 1781171906623).
 */
export class BackfillSimpleProductImplicitVariants1781510571106
  implements MigrationInterface
{
  name = 'BackfillSimpleProductImplicitVariants1781510571106';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      WITH new_variants AS (
        INSERT INTO "product_variants" ("product_id", "sku_code", "is_enabled")
        SELECT p."id", p."sku", true
        FROM "products" p
        WHERE p."type" = 'simple'
          AND p."deleted_at" IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM "product_variants" v WHERE v."product_id" = p."id"
          )
        RETURNING "id", "product_id"
      )
      INSERT INTO "inventory"
        ("variant_id", "product_id", "on_hand", "reserved", "available", "low_stock_threshold")
      SELECT nv."id", nv."product_id", 0, 0, 0, 0
      FROM new_variants nv
    `);
  }

  public async down(): Promise<void> {
    // No-op: variant ids + inventory rows are authoritative owned data (referenced by INV/CART/ORD);
    // we never delete them on rollback.
  }
}
