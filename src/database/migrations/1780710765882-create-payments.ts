import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PAY core (SRS 05 §8): `payments` (one active per order+purpose, full lifecycle, gateway refs +
 * COD fields — never card data), `refunds` (prepaid-cancel/duplicate only), `payment_transaction_log`
 * (append-only reconciliation, gateway_reference backs idempotency), and `gateway_config` (per-method
 * enable + environment + secret reference, never the raw secret). Real system-clock epoch (> create-orders).
 */
export class CreatePayments1780710765882 implements MigrationInterface {
  name = 'CreatePayments1780710765882';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE "payment_method_enum" AS ENUM ('cod','bkash','sslcommerz')`);
    await q.query(`CREATE TYPE "payment_purpose_enum" AS ENUM ('order','exchange_difference')`);
    await q.query(`
      CREATE TYPE "payment_status_enum" AS ENUM (
        'pending','initiated','paid','failed','cancelled','cod_pending','cod_collected',
        'refund_pending','refunded','partially_refunded'
      )
    `);
    await q.query(`CREATE TYPE "refund_type_enum" AS ENUM ('gateway','manual')`);
    await q.query(`CREATE TYPE "refund_status_enum" AS ENUM ('pending','completed','failed')`);
    await q.query(
      `CREATE TYPE "payment_log_event_enum" AS ENUM ('initiate','create','callback','ipn','execute','query','validate','refund')`,
    );
    await q.query(
      `CREATE TYPE "payment_log_result_enum" AS ENUM ('success','failed','mismatch','duplicate_ignored')`,
    );
    await q.query(`CREATE TYPE "gateway_environment_enum" AS ENUM ('sandbox','live')`);

    await q.query(`
      CREATE TABLE "payments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL,
        "purpose" "payment_purpose_enum" NOT NULL DEFAULT 'order',
        "exchange_id" uuid,
        "method" "payment_method_enum" NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "currency" varchar(3) NOT NULL DEFAULT 'BDT',
        "status" "payment_status_enum" NOT NULL DEFAULT 'pending',
        "internal_ref" varchar(40) NOT NULL,
        "gateway_payment_id" varchar(120),
        "gateway_txn_id" varchar(120),
        "collected_by_admin_id" uuid,
        "collected_at" timestamptz,
        "refunded_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "paid_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_payments_internal_ref" UNIQUE ("internal_ref")
      )
    `);
    await q.query(`CREATE INDEX "idx_payments_order" ON "payments" ("order_id")`);
    await q.query(`CREATE INDEX "idx_payments_status" ON "payments" ("status")`);

    await q.query(`
      CREATE TABLE "refunds" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "payment_id" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "reason" varchar(160) NOT NULL,
        "type" "refund_type_enum" NOT NULL DEFAULT 'gateway',
        "gateway_refund_ref" varchar(120),
        "status" "refund_status_enum" NOT NULL DEFAULT 'pending',
        "requested_by_admin_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_refunds_payment" FOREIGN KEY ("payment_id")
          REFERENCES "payments" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "idx_refunds_payment" ON "refunds" ("payment_id")`);

    await q.query(`
      CREATE TABLE "payment_transaction_log" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "payment_id" uuid,
        "method" "payment_method_enum" NOT NULL,
        "event" "payment_log_event_enum" NOT NULL,
        "gateway_reference" varchar(120),
        "request_summary" jsonb NOT NULL DEFAULT '{}',
        "response_summary" jsonb NOT NULL DEFAULT '{}',
        "result" "payment_log_result_enum" NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX "idx_paylog_payment" ON "payment_transaction_log" ("payment_id")`);
    await q.query(`CREATE INDEX "idx_paylog_gateway_ref" ON "payment_transaction_log" ("gateway_reference")`);

    await q.query(`
      CREATE TABLE "gateway_config" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "method" "payment_method_enum" NOT NULL,
        "environment" "gateway_environment_enum" NOT NULL DEFAULT 'sandbox',
        "credentials_ref" text,
        "is_enabled" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_gateway_config_method" UNIQUE ("method")
      )
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "gateway_config"`);
    await q.query(`DROP TABLE IF EXISTS "payment_transaction_log"`);
    await q.query(`DROP TABLE IF EXISTS "refunds"`);
    await q.query(`DROP TABLE IF EXISTS "payments"`);
    await q.query(`DROP TYPE IF EXISTS "gateway_environment_enum"`);
    await q.query(`DROP TYPE IF EXISTS "payment_log_result_enum"`);
    await q.query(`DROP TYPE IF EXISTS "payment_log_event_enum"`);
    await q.query(`DROP TYPE IF EXISTS "refund_status_enum"`);
    await q.query(`DROP TYPE IF EXISTS "refund_type_enum"`);
    await q.query(`DROP TYPE IF EXISTS "payment_status_enum"`);
    await q.query(`DROP TYPE IF EXISTS "payment_purpose_enum"`);
    await q.query(`DROP TYPE IF EXISTS "payment_method_enum"`);
  }
}
