import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * INV (FR-INV-002): backfill a zero-stock inventory record for every existing (non-deleted) product
 * variant that has none. Variant generation now creates these going forward (catalog → INV port),
 * but variants generated before that wiring have no record, so they could not be stock-managed
 * (bulk/receive/adjust 404 with no_inventory_record). Idempotent; no down (records are owned data).
 * Real system-clock epoch (> widen-admin-session-device-label 1781167182168).
 */
export class BackfillVariantInventoryRecords1781171906623 implements MigrationInterface {
  name = 'BackfillVariantInventoryRecords1781171906623';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      INSERT INTO "inventory" ("variant_id", "product_id", "on_hand", "reserved", "available", "low_stock_threshold")
      SELECT v."id", v."product_id", 0, 0, 0, 0
      FROM "product_variants" v
      LEFT JOIN "inventory" i ON i."variant_id" = v."id"
      WHERE i."id" IS NULL AND v."deleted_at" IS NULL
    `);
  }

  public async down(): Promise<void> {
    // No-op: inventory records are authoritative owned data; we never delete stock rows on rollback.
  }
}
