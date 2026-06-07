import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AUTH core schema: customers, otp_challenges, sessions (SRS 01 §8).
 * Timestamp is the real system-clock epoch at creation time (migration-timestamp rule).
 */
export class AuthCore1780570470899 implements MigrationInterface {
  name = 'AuthCore1780570470899';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "customers" (
        "id" uuid PRIMARY KEY,
        "full_name" varchar(120) NOT NULL,
        "phone" varchar(16) NOT NULL,
        "email" varchar(160),
        "password_hash" varchar,
        "is_lightweight" boolean NOT NULL DEFAULT false,
        "phone_verified" boolean NOT NULL DEFAULT false,
        "email_verified" boolean NOT NULL DEFAULT false,
        "gender" varchar(20),
        "date_of_birth" date,
        "promo_sms_opt_in" boolean NOT NULL DEFAULT false,
        "promo_email_opt_in" boolean NOT NULL DEFAULT false,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "last_login_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_customers_phone" ON "customers" ("phone")`);
    await queryRunner.query(`CREATE INDEX "idx_customers_email" ON "customers" ("email")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_customers_phone_active" ON "customers" ("phone") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_customers_email_active" ON "customers" ("email") WHERE "deleted_at" IS NULL AND "email" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "otp_challenges" (
        "id" uuid PRIMARY KEY,
        "phone" varchar(16) NOT NULL,
        "otp_hash" varchar(255) NOT NULL,
        "purpose" varchar(20) NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_otp_phone" ON "otp_challenges" ("phone")`);
    await queryRunner.query(
      `CREATE INDEX "idx_otp_phone_created" ON "otp_challenges" ("phone", "created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id" uuid PRIMARY KEY,
        "customer_id" uuid NOT NULL,
        "refresh_token_hash" varchar(255) NOT NULL,
        "device_label" varchar(120),
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_sessions_customer" FOREIGN KEY ("customer_id")
          REFERENCES "customers" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_sessions_customer" ON "sessions" ("customer_id")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_sessions_refresh_hash" ON "sessions" ("refresh_token_hash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "otp_challenges"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customers"`);
  }
}
