import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ORD exchange engine (SRS 06 §8): `exchanges` (post-delivery exchange request → QA/approval → linked
 * replacement order + price difference + returned-item disposition) and `exchange_attachments` (evidence,
 * uploaded first then linked — `exchange_id` nullable until linked). Money is numeric(12,2);
 * `price_difference` is ≥ 0 (no cash back, BR-ORD-8). Real system-clock epoch (> create-order-notes).
 */
export class CreateExchanges1780719939096 implements MigrationInterface {
  name = 'CreateExchanges1780719939096';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TYPE "exchange_reason_enum" AS ENUM ('wrong_size','quality_defect','other')`,
    );
    await q.query(`
      CREATE TYPE "exchange_status_enum" AS ENUM (
        'requested','under_qa_review','approved','replacement_issued','completed','rejected'
      )
    `);
    await q.query(
      `CREATE TYPE "exchange_disposition_enum" AS ENUM ('restocked','scrapped')`,
    );

    await q.query(`
      CREATE TABLE "exchanges" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL,
        "order_item_id" uuid NOT NULL,
        "reason" "exchange_reason_enum" NOT NULL,
        "customer_note" text,
        "status" "exchange_status_enum" NOT NULL DEFAULT 'requested',
        "rejection_reason" varchar(160),
        "replacement_variant_id" uuid,
        "replacement_order_id" uuid,
        "price_difference" numeric(12,2) NOT NULL DEFAULT 0,
        "difference_payment_id" uuid,
        "returned_item_disposition" "exchange_disposition_enum",
        "reviewed_by_admin_id" uuid,
        "qa_due_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_exchanges_order" FOREIGN KEY ("order_id")
          REFERENCES "orders" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_exchanges_order_item" FOREIGN KEY ("order_item_id")
          REFERENCES "order_items" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "idx_exchanges_order" ON "exchanges" ("order_id")`);
    await q.query(`CREATE INDEX "idx_exchanges_order_item" ON "exchanges" ("order_item_id")`);
    await q.query(`CREATE INDEX "idx_exchanges_status" ON "exchanges" ("status")`);

    await q.query(`
      CREATE TABLE "exchange_attachments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "exchange_id" uuid,
        "url" varchar(500) NOT NULL,
        "content_type" varchar(80) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_exchange_attachments_exchange" FOREIGN KEY ("exchange_id")
          REFERENCES "exchanges" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(
      `CREATE INDEX "idx_exchange_attachments_exchange" ON "exchange_attachments" ("exchange_id")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "exchange_attachments"`);
    await q.query(`DROP TABLE IF EXISTS "exchanges"`);
    await q.query(`DROP TYPE IF EXISTS "exchange_disposition_enum"`);
    await q.query(`DROP TYPE IF EXISTS "exchange_status_enum"`);
    await q.query(`DROP TYPE IF EXISTS "exchange_reason_enum"`);
  }
}
