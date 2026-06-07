import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ORD fulfilment (SRS 06 §5.9 FR-ORD-072): `order_notes` — internal, admin-only notes on an order
 * (never surfaced on customer reads). Append-only operational trail. Real system-clock epoch
 * (> the create-checkout migration).
 */
export class CreateOrderNotes1780719372392 implements MigrationInterface {
  name = 'CreateOrderNotes1780719372392';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "order_notes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL,
        "body" text NOT NULL,
        "author_admin_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_order_notes_order" FOREIGN KEY ("order_id")
          REFERENCES "orders" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "idx_order_notes_order" ON "order_notes" ("order_id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "order_notes"`);
  }
}
