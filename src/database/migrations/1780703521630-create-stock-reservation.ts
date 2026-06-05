import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stock reservations (SRS 11 §8 StockReservation, FR-INV-020–023) — short-lived holds created at order
 * placement and consumed on decrement / released on failure-or-expiry. Indexed on `order_id` (order
 * lookup) and `(status, expires_at)` (the expiry sweep). FK to `product_variants`. Real system epoch.
 */
export class CreateStockReservation1780703521630 implements MigrationInterface {
  name = 'CreateStockReservation1780703521630';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TYPE "stock_reservation_status_enum" AS ENUM
        ('held', 'consumed', 'released', 'expired')
    `);
    await q.query(`
      CREATE TABLE "stock_reservations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL,
        "variant_id" uuid NOT NULL,
        "quantity" integer NOT NULL,
        "status" "stock_reservation_status_enum" NOT NULL DEFAULT 'held',
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_stock_reservations_qty_positive" CHECK ("quantity" > 0),
        CONSTRAINT "fk_stock_reservations_variant" FOREIGN KEY ("variant_id")
          REFERENCES "product_variants" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(
      `CREATE INDEX "idx_stock_reservations_order" ON "stock_reservations" ("order_id")`,
    );
    await q.query(
      `CREATE INDEX "idx_stock_reservations_status_expires" ON "stock_reservations" ("status", "expires_at")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "stock_reservations"`);
    await q.query(`DROP TYPE IF EXISTS "stock_reservation_status_enum"`);
  }
}
