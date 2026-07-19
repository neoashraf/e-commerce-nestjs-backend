import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AUTH verify-before-attach email change (SRS 01 §8 EmailChangeRequest, FR-AUTH-041/044):
 * pending email changes live here — hashed single-use code, 15-min expiry — and attach to
 * the account only on successful confirm. Timestamp is the real system-clock epoch at
 * creation time (migration-timestamp rule).
 */
export class EmailChangeRequest1784472389684 implements MigrationInterface {
  name = 'EmailChangeRequest1784472389684';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "email_change_requests" (
        "id" uuid PRIMARY KEY,
        "customer_id" uuid NOT NULL,
        "new_email" varchar(160) NOT NULL,
        "token_hash" varchar(255) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_email_change_customer" FOREIGN KEY ("customer_id")
          REFERENCES "customers" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_email_change_customer" ON "email_change_requests" ("customer_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "email_change_requests"`);
  }
}
