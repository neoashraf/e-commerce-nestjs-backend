import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * RPT export + scheduling (SRS 15 §8, FR-RPT-070/071): `report_exports` (async report exports — params,
 * format, status, expiring `file_url`, requester) and `scheduled_reports` (recurring digests — params
 * template, cadence, admin recipients, `last_run_at`, and the suspended-recipient flag from §12.11).
 * RPT owns no transactional data; these two config tables are the module's only persistence. Real
 * system-clock epoch (> notif-promotional-deferral 1780725700900).
 */
export class CreateReportExportsSchedules1780729579392 implements MigrationInterface {
  name = 'CreateReportExportsSchedules1780729579392';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE "report_export_format_enum" AS ENUM ('csv','pdf')`);
    await q.query(`CREATE TYPE "report_export_status_enum" AS ENUM ('processing','ready','failed')`);
    await q.query(`CREATE TYPE "scheduled_report_cadence_enum" AS ENUM ('daily','weekly','monthly')`);

    await q.query(`
      CREATE TABLE "report_exports" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "report_key" varchar(60) NOT NULL,
        "params" jsonb NOT NULL,
        "format" "report_export_format_enum" NOT NULL,
        "status" "report_export_status_enum" NOT NULL DEFAULT 'processing',
        "file_url" text,
        "error_reason" text,
        "requested_by_admin_id" uuid NOT NULL,
        "expires_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX "idx_report_exports_requester" ON "report_exports" ("requested_by_admin_id")`,
    );

    await q.query(`
      CREATE TABLE "scheduled_reports" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "report_key" varchar(60) NOT NULL,
        "params" jsonb NOT NULL,
        "cadence" "scheduled_report_cadence_enum" NOT NULL,
        "recipients_admin_ids" uuid[] NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "last_run_at" timestamptz,
        "last_run_skipped_admin_ids" uuid[],
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX "idx_scheduled_reports_active" ON "scheduled_reports" ("is_active")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_scheduled_reports_active"`);
    await q.query(`DROP TABLE IF EXISTS "scheduled_reports"`);
    await q.query(`DROP INDEX IF EXISTS "idx_report_exports_requester"`);
    await q.query(`DROP TABLE IF EXISTS "report_exports"`);
    await q.query(`DROP TYPE IF EXISTS "scheduled_report_cadence_enum"`);
    await q.query(`DROP TYPE IF EXISTS "report_export_status_enum"`);
    await q.query(`DROP TYPE IF EXISTS "report_export_format_enum"`);
  }
}
