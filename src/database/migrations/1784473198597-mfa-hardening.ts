import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MFA hardening (SRS 17 v0.2, Phase B):
 * - `sessions.mfa_verified` (FR-MFA-018): marks sessions created through a completed
 *   second factor so FR-MFA-002 disable gating is decidable.
 * - `mfa_settings.default_channel` (FR-MFA-036): first-attempt delivery channel for
 *   customers with both channels eligible and no saved preference (default `email`).
 * The `disable` challenge purpose needs no schema change (`mfa_challenges.purpose` is varchar).
 * Timestamp is the real system-clock epoch at creation time (migration-timestamp rule).
 */
export class MfaHardening1784473198597 implements MigrationInterface {
  name = 'MfaHardening1784473198597';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD COLUMN "mfa_verified" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "mfa_settings" ADD COLUMN "default_channel" varchar(10) NOT NULL DEFAULT 'email'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "mfa_settings" DROP COLUMN IF EXISTS "default_channel"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN IF EXISTS "mfa_verified"`);
  }
}
