import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AUTH email + password path (SRS 01 §5.2/§5.4/§5.5):
 *  - brute-force lockout columns on `customers` (failed_login_attempts, locked_until) for FR-AUTH-012
 *  - `email_verification_tokens` for the single-use email-verify link (FR-AUTH-043)
 * Timestamp is the real system-clock epoch at creation time (migration-timestamp rule).
 */
export class AuthEmail1780685101652 implements MigrationInterface {
  name = 'AuthEmail1780685101652';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customers" ADD COLUMN "failed_login_attempts" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN "locked_until" timestamptz`);

    // Email-only registrations (FR-AUTH-002) have no phone yet — stored as '' since the SRS
    // data model keeps `phone` NOT NULL. Refine the active-phone uniqueness to ignore the
    // empty sentinel so multiple email-only accounts can coexist while real phones stay unique
    // (BR-AUTH-1).
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_customers_phone_active"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_customers_phone_active" ON "customers" ("phone") WHERE "deleted_at" IS NULL AND "phone" <> ''`,
    );

    await queryRunner.query(`
      CREATE TABLE "email_verification_tokens" (
        "id" uuid PRIMARY KEY,
        "customer_id" uuid NOT NULL,
        "token_hash" varchar(255) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_email_verify_customer" FOREIGN KEY ("customer_id")
          REFERENCES "customers" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_email_verify_customer" ON "email_verification_tokens" ("customer_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_email_verify_token_hash" ON "email_verification_tokens" ("token_hash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "email_verification_tokens"`);
    // Restore the original active-phone uniqueness (without the empty-sentinel exclusion).
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_customers_phone_active"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_customers_phone_active" ON "customers" ("phone") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN IF EXISTS "locked_until"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN IF EXISTS "failed_login_attempts"`);
  }
}
