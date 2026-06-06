import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CART checkout (SRS 04 §8): `checkout_sessions` (binds quote→place, backs idempotent placement via a
 * unique `idempotency_key`, records the placed order for replay) and `delivery_zone_charges` (per-zone
 * delivery charge + COD surcharge + free-shipping threshold + COD flag, read by the quote — deferred to
 * the checkout slice by cart-delivery-zone-be). Seeded with the resolved BD defaults (SRS §15). Real
 * system-clock epoch (> create-cart).
 */
export class CreateCheckout1780711758617 implements MigrationInterface {
  name = 'CreateCheckout1780711758617';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "checkout_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "cart_id" uuid,
        "idempotency_key" varchar(120),
        "placed_order_id" uuid,
        "placed_order_no" varchar(20),
        "order_status" varchar(32),
        "payment_action" varchar(16),
        "payment_redirect_url" text,
        "payment_status" varchar(32),
        "grand_total" numeric(12,2),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX "uq_checkout_idempotency_key" ON "checkout_sessions" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );

    await q.query(`CREATE TYPE "delivery_zone_charge_zone_enum" AS ENUM ('inside_dhaka','near_dhaka','outside_dhaka')`);
    await q.query(`
      CREATE TABLE "delivery_zone_charges" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "zone" "delivery_zone_charge_zone_enum" NOT NULL,
        "delivery_charge" numeric(12,2) NOT NULL DEFAULT 0,
        "cod_surcharge_pct" numeric(5,2) NOT NULL DEFAULT 0,
        "cod_surcharge_flat" numeric(12,2) NOT NULL DEFAULT 0,
        "free_shipping_threshold" numeric(12,2),
        "cod_enabled" boolean NOT NULL DEFAULT true,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_delivery_zone_charges_zone" UNIQUE ("zone")
      )
    `);
    // Seed the resolved BD defaults (SRS §15): Inside ৳70 / Near ৳90 / Outside ৳120; COD 1% Outside only.
    await q.query(`
      INSERT INTO "delivery_zone_charges" ("zone","delivery_charge","cod_surcharge_pct","cod_enabled","is_active") VALUES
        ('inside_dhaka','70.00','0.00',true,true),
        ('near_dhaka','90.00','0.00',true,true),
        ('outside_dhaka','120.00','1.00',true,true)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "delivery_zone_charges"`);
    await q.query(`DROP TYPE IF EXISTS "delivery_zone_charge_zone_enum"`);
    await q.query(`DROP TABLE IF EXISTS "checkout_sessions"`);
  }
}
