import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CART core (SRS 04 §8): `carts` (customer- or guest-owned; at most one `active` cart per customer via a
 * partial unique index; unique `cart_token`; `applied_coupon_code` column unused this slice) and
 * `cart_items` (one line per cart+variant via a unique index — adds increment; no price columns, prices
 * read live from CAT, BR-CART-1). Real system-clock epoch (> create-payments).
 */
export class CreateCart1780711282611 implements MigrationInterface {
  name = 'CreateCart1780711282611';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE "cart_status_enum" AS ENUM ('active','converted','abandoned')`);

    await q.query(`
      CREATE TABLE "carts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "customer_id" uuid,
        "cart_token" varchar(64),
        "applied_coupon_code" varchar(40),
        "status" "cart_status_enum" NOT NULL DEFAULT 'active',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX "idx_carts_customer" ON "carts" ("customer_id")`);
    await q.query(
      `CREATE UNIQUE INDEX "uq_carts_cart_token" ON "carts" ("cart_token") WHERE "cart_token" IS NOT NULL`,
    );
    // At most one active cart per customer (BR-CART, AC1).
    await q.query(
      `CREATE UNIQUE INDEX "uq_carts_active_customer" ON "carts" ("customer_id") WHERE "status" = 'active' AND "customer_id" IS NOT NULL`,
    );

    await q.query(`
      CREATE TABLE "cart_items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "cart_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "variant_id" uuid NOT NULL,
        "quantity" integer NOT NULL,
        "added_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_cart_items_cart" FOREIGN KEY ("cart_id")
          REFERENCES "carts" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "idx_cart_items_cart" ON "cart_items" ("cart_id")`);
    await q.query(
      `CREATE UNIQUE INDEX "uq_cart_items_cart_variant" ON "cart_items" ("cart_id", "variant_id")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "cart_items"`);
    await q.query(`DROP TABLE IF EXISTS "carts"`);
    await q.query(`DROP TYPE IF EXISTS "cart_status_enum"`);
  }
}
