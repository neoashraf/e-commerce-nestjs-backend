import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CUST (SRS 12 §8): the admin-side annotations CUST owns — `customer_notes` (append-only internal notes,
 * BR-CUST-7), `customer_tags` + `customer_tag_assignments` (segmentation catalog + idempotent join;
 * assignments cascade-delete with their tag, §12.8), and `customer_account_actions` (suspend/reactivate
 * log, BR-CUST-6). Plus `customer_exports` — the async CSV export job backing POST/GET /export
 * (FR-CUST-040), mirroring RPT's report_exports. Identity/orders/leads/wishlist stay in their own modules
 * (read via ports). Real system-clock epoch (> create-report-exports-schedules 1780729579392).
 */
export class CreateCustomersAdmin1780730970789 implements MigrationInterface {
  name = 'CreateCustomersAdmin1780730970789';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE "customer_account_action_enum" AS ENUM ('suspend','reactivate')`);
    await q.query(`CREATE TYPE "customer_export_status_enum" AS ENUM ('processing','ready','failed')`);

    await q.query(`
      CREATE TABLE "customer_notes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "customer_id" uuid NOT NULL,
        "admin_id" uuid NOT NULL,
        "body" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX "idx_customer_notes_customer" ON "customer_notes" ("customer_id")`);

    await q.query(`
      CREATE TABLE "customer_tags" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "key" varchar(40) NOT NULL,
        "label" varchar(60) NOT NULL,
        "color" varchar(7),
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE UNIQUE INDEX "uq_customer_tags_key" ON "customer_tags" ("key")`);

    await q.query(`
      CREATE TABLE "customer_tag_assignments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "customer_id" uuid NOT NULL,
        "tag_id" uuid NOT NULL,
        "assigned_by_admin_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_customer_tag_assignments_tag" FOREIGN KEY ("tag_id")
          REFERENCES "customer_tags" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(
      `CREATE INDEX "idx_customer_tag_assignments_customer" ON "customer_tag_assignments" ("customer_id")`,
    );
    await q.query(
      `CREATE INDEX "idx_customer_tag_assignments_tag" ON "customer_tag_assignments" ("tag_id")`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "uq_customer_tag_assignment" ON "customer_tag_assignments" ("customer_id","tag_id")`,
    );

    await q.query(`
      CREATE TABLE "customer_account_actions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "customer_id" uuid NOT NULL,
        "admin_id" uuid NOT NULL,
        "action" "customer_account_action_enum" NOT NULL,
        "reason" varchar(160),
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX "idx_customer_account_actions_customer" ON "customer_account_actions" ("customer_id")`,
    );

    await q.query(`
      CREATE TABLE "customer_exports" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "requested_by_admin_id" uuid NOT NULL,
        "filters" jsonb NOT NULL,
        "fields" jsonb NOT NULL,
        "status" "customer_export_status_enum" NOT NULL DEFAULT 'processing',
        "file_url" varchar(500),
        "row_count" integer,
        "error_reason" varchar(500),
        "expires_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "customer_exports"`);
    await q.query(`DROP INDEX IF EXISTS "idx_customer_account_actions_customer"`);
    await q.query(`DROP TABLE IF EXISTS "customer_account_actions"`);
    await q.query(`DROP INDEX IF EXISTS "uq_customer_tag_assignment"`);
    await q.query(`DROP INDEX IF EXISTS "idx_customer_tag_assignments_tag"`);
    await q.query(`DROP INDEX IF EXISTS "idx_customer_tag_assignments_customer"`);
    await q.query(`DROP TABLE IF EXISTS "customer_tag_assignments"`);
    await q.query(`DROP INDEX IF EXISTS "uq_customer_tags_key"`);
    await q.query(`DROP TABLE IF EXISTS "customer_tags"`);
    await q.query(`DROP INDEX IF EXISTS "idx_customer_notes_customer"`);
    await q.query(`DROP TABLE IF EXISTS "customer_notes"`);
    await q.query(`DROP TYPE IF EXISTS "customer_export_status_enum"`);
    await q.query(`DROP TYPE IF EXISTS "customer_account_action_enum"`);
  }
}
