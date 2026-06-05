import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stock movement ledger (SRS 11 §5.6 / §8 StockMovement, FR-INV-050/052) — the append-only audit of
 * every quantity change. Immutable: written only via INSERT (no UPDATE/DELETE path in code). Indexed
 * on `(variant_id, created_at)` for the SKU history query and on `type` for the type filter. FK to
 * `product_variants` keeps movements tied to a SKU. Timestamp is the real system epoch.
 */
export class CreateStockMovement1780703102888 implements MigrationInterface {
  name = 'CreateStockMovement1780703102888';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TYPE "stock_movement_type_enum" AS ENUM
        ('receive', 'adjust', 'correction', 'reserve', 'release', 'sale', 'restock', 'scrap')
    `);
    await q.query(`
      CREATE TYPE "stock_movement_actor_type_enum" AS ENUM ('admin', 'system')
    `);
    await q.query(`
      CREATE TABLE "stock_movements" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "variant_id" uuid NOT NULL,
        "type" "stock_movement_type_enum" NOT NULL,
        "quantity_delta" integer NOT NULL,
        "resulting_on_hand" integer NOT NULL,
        "reason" character varying(160),
        "order_id" uuid,
        "actor_type" "stock_movement_actor_type_enum" NOT NULL,
        "actor_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_stock_movements_variant" FOREIGN KEY ("variant_id")
          REFERENCES "product_variants" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(
      `CREATE INDEX "idx_stock_movements_variant_created" ON "stock_movements" ("variant_id", "created_at")`,
    );
    await q.query(`CREATE INDEX "idx_stock_movements_type" ON "stock_movements" ("type")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "stock_movements"`);
    await q.query(`DROP TYPE IF EXISTS "stock_movement_actor_type_enum"`);
    await q.query(`DROP TYPE IF EXISTS "stock_movement_type_enum"`);
  }
}
