import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DASH (SRS 10 §8): `dashboard_preferences` — the optional per-admin dashboard layout (FR-DASH-031).
 * One row per admin (`admin_user_id` unique). DASH owns no other business data — it composes its
 * KPIs/alerts/breakdowns/activity from the owning modules via read ports (BR-DASH-1/2).
 * Real system-clock epoch (> create-customers-admin 1780730970789).
 */
export class CreateDashboardPreference1780732628726 implements MigrationInterface {
  name = 'CreateDashboardPreference1780732628726';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "dashboard_preferences" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "admin_user_id" uuid NOT NULL,
        "default_period" varchar(16) NOT NULL DEFAULT 'last_7d',
        "widget_order" jsonb,
        "hidden_widgets" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX "uq_dashboard_preferences_admin" ON "dashboard_preferences" ("admin_user_id")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "uq_dashboard_preferences_admin"`);
    await q.query(`DROP TABLE IF EXISTS "dashboard_preferences"`);
  }
}
