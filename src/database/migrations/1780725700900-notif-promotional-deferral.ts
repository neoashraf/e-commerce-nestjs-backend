import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * NOTIF promotional path (SRS 09 §5.6, FR-NOTIF-052/§12.10). Adds `deferred_until` to `notifications`
 * so a promotional send caught by quiet hours is parked as `queued` with a wake time and delivered by
 * the deferral sweeper rather than dropped. A partial index drives the sweeper's "due deferrals" scan.
 * Real system-clock epoch (> notif-template-versioning 1780724709596).
 */
export class NotifPromotionalDeferral1780725700900 implements MigrationInterface {
  name = 'NotifPromotionalDeferral1780725700900';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "deferred_until" timestamptz`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_notifications_deferred_until"
         ON "notifications" ("deferred_until")
         WHERE "deferred_until" IS NOT NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_notifications_deferred_until"`);
    await q.query(`ALTER TABLE "notifications" DROP COLUMN IF EXISTS "deferred_until"`);
  }
}
