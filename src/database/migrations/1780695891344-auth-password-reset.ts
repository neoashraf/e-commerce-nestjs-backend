import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AUTH password reset (SRS 01 §5.4, FR-AUTH-033/035): single-use, time-limited
 * `password_reset_tokens` (hash only). Timestamp is the real system-clock epoch at
 * creation time (migration-timestamp rule).
 */
export class AuthPasswordReset1780695891344 implements MigrationInterface {
  name = 'AuthPasswordReset1780695891344';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "password_reset_tokens" (
        "id" uuid PRIMARY KEY,
        "customer_id" uuid NOT NULL,
        "token_hash" varchar(255) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_password_reset_customer" FOREIGN KEY ("customer_id")
          REFERENCES "customers" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_password_reset_customer" ON "password_reset_tokens" ("customer_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_password_reset_token_hash" ON "password_reset_tokens" ("token_hash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "password_reset_tokens"`);
  }
}
