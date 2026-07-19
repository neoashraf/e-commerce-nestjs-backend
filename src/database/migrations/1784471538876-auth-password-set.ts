import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AUTH first-password set (SRS 01 §5.4, FR-AUTH-036/037/038, Phase B hardening):
 * - `sessions.otp_verified_at` — freshness marker so the 10-minute OTP waiver of
 *   FR-AUTH-037 is decidable (flagged in the brief: one column beyond the SRS Session model).
 * - `password_set_tokens` — single-use, time-limited `pst_…` tokens (hash only), issued
 *   inside the freshness window instead of a fresh OTP. Mirrors `password_reset_tokens`.
 * The `password_set` OTP purpose needs no schema change (`otp_challenges.purpose` is varchar).
 * Timestamp is the real system-clock epoch at creation time (migration-timestamp rule).
 */
export class AuthPasswordSet1784471538876 implements MigrationInterface {
  name = 'AuthPasswordSet1784471538876';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD COLUMN "otp_verified_at" timestamptz NULL`,
    );
    await queryRunner.query(`
      CREATE TABLE "password_set_tokens" (
        "id" uuid PRIMARY KEY,
        "customer_id" uuid NOT NULL,
        "token_hash" varchar(255) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_password_set_customer" FOREIGN KEY ("customer_id")
          REFERENCES "customers" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_password_set_customer" ON "password_set_tokens" ("customer_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_password_set_token_hash" ON "password_set_tokens" ("token_hash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "password_set_tokens"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN IF EXISTS "otp_verified_at"`);
  }
}
