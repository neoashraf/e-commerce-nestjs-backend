import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * RBAC (SRS 16): widen `admin_sessions.device_label` from varchar(120) → varchar(255).
 * The device label is populated from the browser User-Agent header, which routinely exceeds
 * 120 chars (modern Chrome/Edge UAs are 130–180+). At 120 the session INSERT on a successful
 * admin login / 2FA verify / token refresh threw Postgres 22001 ("value too long"), surfacing
 * as a 500 on POST /admin/auth/2fa/verify. 255 covers real-world UAs; the app also caps the
 * captured value defensively.
 * Real system-clock epoch (> create-dashboard-preference 1780732628726).
 */
export class WidenAdminSessionDeviceLabel1781167182168 implements MigrationInterface {
  name = 'WidenAdminSessionDeviceLabel1781167182168';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "admin_sessions" ALTER COLUMN "device_label" TYPE varchar(255)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Truncate any over-length labels first so the narrowing cannot fail.
    await q.query(
      `UPDATE "admin_sessions" SET "device_label" = LEFT("device_label", 120) WHERE LENGTH("device_label") > 120`,
    );
    await q.query(`ALTER TABLE "admin_sessions" ALTER COLUMN "device_label" TYPE varchar(120)`);
  }
}
