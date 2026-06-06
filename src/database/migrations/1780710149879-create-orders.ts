import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ORD core (SRS 06 §8): `orders` (immutable snapshot + status lifecycle + payment-state mirror +
 * shipment + replacement link), `order_items` (immutable line snapshots), and `order_status_history`
 * (append-only trail). Order numbers come from a Postgres sequence `order_no_seq` starting at 100000
 * (BR-ORD-2). Real system-clock epoch (> the create-promotions migration).
 */
export class CreateOrders1780710149879 implements MigrationInterface {
  name = 'CreateOrders1780710149879';

  public async up(q: QueryRunner): Promise<void> {
    // Human-readable order-number sequence (SO-100000, SO-100001, …).
    await q.query(`CREATE SEQUENCE IF NOT EXISTS "order_no_seq" START WITH 100000 INCREMENT BY 1`);

    await q.query(`
      CREATE TYPE "order_status_enum" AS ENUM (
        'pending_payment','confirmed','processing','packed','shipped','out_for_delivery',
        'delivered','cancelled','refunded','exchange_requested','exchanged'
      )
    `);
    await q.query(`CREATE TYPE "order_payment_method_enum" AS ENUM ('cod','bkash','sslcommerz')`);
    await q.query(`
      CREATE TYPE "order_payment_state_enum" AS ENUM (
        'unpaid','cod_pending','paid','cod_collected','refunded','partially_refunded'
      )
    `);
    await q.query(
      `CREATE TYPE "order_delivery_zone_enum" AS ENUM ('inside_dhaka','near_dhaka','outside_dhaka')`,
    );
    await q.query(`CREATE TYPE "order_actor_type_enum" AS ENUM ('customer','admin','system')`);

    await q.query(`
      CREATE TABLE "orders" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_no" varchar(20) NOT NULL,
        "customer_id" uuid,
        "guest_name" varchar(120),
        "guest_phone" varchar(16),
        "guest_email" varchar(160),
        "status" "order_status_enum" NOT NULL DEFAULT 'pending_payment',
        "replacement_order_id" uuid,
        "payment_method" "order_payment_method_enum" NOT NULL,
        "payment_state" "order_payment_state_enum" NOT NULL DEFAULT 'unpaid',
        "delivery_zone" "order_delivery_zone_enum" NOT NULL,
        "address_snapshot" jsonb NOT NULL,
        "subtotal" numeric(12,2) NOT NULL,
        "discount_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "applied_coupon_code" varchar(40),
        "delivery_charge" numeric(12,2) NOT NULL DEFAULT 0,
        "cod_surcharge" numeric(12,2) NOT NULL DEFAULT 0,
        "vat_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "grand_total" numeric(12,2) NOT NULL,
        "courier_name" varchar(80),
        "tracking_number" varchar(80),
        "reminder_sent_at" timestamptz,
        "idempotency_key" varchar(120),
        "placed_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_orders_order_no" UNIQUE ("order_no")
      )
    `);
    await q.query(`CREATE INDEX "idx_orders_customer" ON "orders" ("customer_id")`);
    await q.query(`CREATE INDEX "idx_orders_status" ON "orders" ("status")`);
    await q.query(`CREATE INDEX "idx_orders_guest_phone" ON "orders" ("guest_phone")`);
    await q.query(
      `CREATE UNIQUE INDEX "uq_orders_idempotency_key" ON "orders" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );

    await q.query(`
      CREATE TABLE "order_items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "variant_id" uuid NOT NULL,
        "product_title" varchar(180) NOT NULL,
        "sku_code" varchar(64) NOT NULL,
        "variant_options" jsonb NOT NULL DEFAULT '{}',
        "unit_price" numeric(12,2) NOT NULL,
        "quantity" integer NOT NULL,
        "line_total" numeric(12,2) NOT NULL,
        CONSTRAINT "fk_order_items_order" FOREIGN KEY ("order_id")
          REFERENCES "orders" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "idx_order_items_order" ON "order_items" ("order_id")`);

    await q.query(`
      CREATE TABLE "order_status_history" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL,
        "from_status" "order_status_enum",
        "to_status" "order_status_enum" NOT NULL,
        "actor_type" "order_actor_type_enum" NOT NULL,
        "actor_id" uuid,
        "note" varchar(255),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_order_history_order" FOREIGN KEY ("order_id")
          REFERENCES "orders" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "idx_order_history_order" ON "order_status_history" ("order_id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "order_status_history"`);
    await q.query(`DROP TABLE IF EXISTS "order_items"`);
    await q.query(`DROP TABLE IF EXISTS "orders"`);
    await q.query(`DROP TYPE IF EXISTS "order_actor_type_enum"`);
    await q.query(`DROP TYPE IF EXISTS "order_delivery_zone_enum"`);
    await q.query(`DROP TYPE IF EXISTS "order_payment_state_enum"`);
    await q.query(`DROP TYPE IF EXISTS "order_payment_method_enum"`);
    await q.query(`DROP TYPE IF EXISTS "order_status_enum"`);
    await q.query(`DROP SEQUENCE IF EXISTS "order_no_seq"`);
  }
}
