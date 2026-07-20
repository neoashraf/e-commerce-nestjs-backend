import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Admin 2FA enable→confirm, email-only (SRS 16 v0.2, FR-RBAC-002/008/009, Phase B):
 * - `admin_sessions.mfa_verified` — marks sessions whose login passed the 2FA step
 *   (mirrors FR-MFA-018) so the disable fresh-code waiver is decidable.
 * - `admin_twofa_challenges.purpose` — purpose binding (`login` | `enable` | `disable`)
 *   so a code issued for one flow can never complete another.
 * - `admin_users.twofa_channel` normalized to `email` for enabled admins (channel retired;
 *   codes always go to the account email).
 * Timestamp is the real system-clock epoch at creation time (migration-timestamp rule).
 */
export class Admin2faConfirm1784473930701 implements MigrationInterface {
  name = 'Admin2faConfirm1784473930701';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admin_sessions" ADD COLUMN "mfa_verified" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_twofa_challenges" ADD COLUMN "purpose" varchar(10) NOT NULL DEFAULT 'login'`,
    );
    // Channel retirement (FR-RBAC-002): every enabled admin delivers to email.
    await queryRunner.query(
      `UPDATE "admin_users" SET "twofa_channel" = 'email' WHERE "twofa_enabled" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admin_twofa_challenges" DROP COLUMN IF EXISTS "purpose"`,
    );
    await queryRunner.query(`ALTER TABLE "admin_sessions" DROP COLUMN IF EXISTS "mfa_verified"`);
    // twofa_channel normalization is not reversed (no data to restore it from).
  }
}
