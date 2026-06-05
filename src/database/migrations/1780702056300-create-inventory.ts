import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Inventory stock core (SRS 11 §8 Inventory): one authoritative record per variant (SKU). `available`
 * is persisted (`on_hand − reserved`); `reserved`/`last_alert_at` reserved for the deferred
 * reservations/alerts flows. DB-level CHECK constraints keep `on_hand`/`reserved` ≥ 0 (BR-INV-2,
 * §14 integrity); `variant_id` is unique (one record per SKU). Timestamp is the real system epoch.
 */
export class CreateInventory1780702056300 implements MigrationInterface {
  name = 'CreateInventory1780702056300';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "inventory" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "variant_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "on_hand" integer NOT NULL DEFAULT 0,
        "reserved" integer NOT NULL DEFAULT 0,
        "available" integer NOT NULL DEFAULT 0,
        "low_stock_threshold" integer NOT NULL DEFAULT 0,
        "last_alert_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_inventory_on_hand_nonneg" CHECK ("on_hand" >= 0),
        CONSTRAINT "chk_inventory_reserved_nonneg" CHECK ("reserved" >= 0),
        CONSTRAINT "chk_inventory_threshold_nonneg" CHECK ("low_stock_threshold" >= 0),
        CONSTRAINT "fk_inventory_variant" FOREIGN KEY ("variant_id")
          REFERENCES "product_variants" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE UNIQUE INDEX "uq_inventory_variant" ON "inventory" ("variant_id")`);
    await q.query(`CREATE INDEX "idx_inventory_product" ON "inventory" ("product_id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "inventory"`);
  }
}
