import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * NOTIF template management (SRS 09 §5.2, FR-NOTIF-010–014). Adds the admin edit/version surface
 * on top of the dispatch core's `notification_templates`:
 *  - `is_locked` (capability hook for OTP/security templates — SRS §16 open item; default false),
 *  - `updated_by_admin_id` (last editor — SRS §8 data model),
 *  - `notification_template_versions` (append-only snapshot per version so a sent notification's
 *    `template_version` resolves the exact historical content — BR-NOTIF-6 / FR-NOTIF-012).
 * Backfills a v1 snapshot for every existing template. Real system-clock epoch (> create-leads 1780723064170).
 */
export class NotifTemplateVersioning1780724709596 implements MigrationInterface {
  name = 'NotifTemplateVersioning1780724709596';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "notification_templates" ADD COLUMN IF NOT EXISTS "is_locked" boolean NOT NULL DEFAULT false`,
    );
    await q.query(
      `ALTER TABLE "notification_templates" ADD COLUMN IF NOT EXISTS "updated_by_admin_id" uuid`,
    );

    await q.query(`
      CREATE TABLE "notification_template_versions" (
        "id" uuid PRIMARY KEY,
        "template_id" uuid NOT NULL,
        "version" integer NOT NULL,
        "subject" varchar(255),
        "body" text NOT NULL,
        "updated_by_admin_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_ntv_template" FOREIGN KEY ("template_id")
          REFERENCES "notification_templates" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(
      `CREATE INDEX "idx_ntv_template" ON "notification_template_versions" ("template_id")`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "uq_ntv_template_version" ON "notification_template_versions" ("template_id", "version")`,
    );

    // Backfill a snapshot for every existing template at its current version.
    await q.query(`
      INSERT INTO "notification_template_versions"
        ("id","template_id","version","subject","body","updated_by_admin_id","created_at")
      SELECT gen_random_uuid(), "id", "version", "subject", "body", "updated_by_admin_id", "created_at"
      FROM "notification_templates"
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "uq_ntv_template_version"`);
    await q.query(`DROP INDEX IF EXISTS "idx_ntv_template"`);
    await q.query(`DROP TABLE IF EXISTS "notification_template_versions"`);
    await q.query(`ALTER TABLE "notification_templates" DROP COLUMN IF EXISTS "updated_by_admin_id"`);
    await q.query(`ALTER TABLE "notification_templates" DROP COLUMN IF EXISTS "is_locked"`);
  }
}
