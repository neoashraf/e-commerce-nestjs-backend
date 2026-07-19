import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Retire the lightweight-account machinery (decision 2026-07-18, SRS 01 v0.2 §5.8):
 * checkout is OTP-gated (FR-AUTH-070), so lightweight accounts can no longer be created
 * and the flag is always false — drop it. The claim + internal provisioning endpoints
 * are removed in the same change; the legacy guest-order claim sweep on OTP verification
 * stays (FR-AUTH-071). Timestamp is the real system-clock epoch (migration-timestamp rule).
 */
export class DropIsLightweight1784474319336 implements MigrationInterface {
  name = 'DropIsLightweight1784474319336';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN IF EXISTS "is_lightweight"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customers" ADD COLUMN "is_lightweight" boolean NOT NULL DEFAULT false`,
    );
  }
}
