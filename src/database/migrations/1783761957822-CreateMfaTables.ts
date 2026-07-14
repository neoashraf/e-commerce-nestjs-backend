import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MFA (module 17) — configurable customer 2FA. Creates the global policy row, the per-customer
 * 2FA state (companion to `customers`), and the login second-factor challenge + pre-auth tables.
 * Seeds the single policy row with the launch defaults: email on, SMS off, enforcement optional
 * (BR-MFA-10). See docs/srs/17-mfa.md §8.
 */
export class CreateMfaTables1783761957822 implements MigrationInterface {
  name = 'CreateMfaTables1783761957822';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "mfa_settings" (
        "id" uuid PRIMARY KEY,
        "sms_enabled" boolean NOT NULL DEFAULT false,
        "email_enabled" boolean NOT NULL DEFAULT true,
        "enforcement_mode" varchar(20) NOT NULL DEFAULT 'optional',
        "otp_ttl_seconds" integer NOT NULL DEFAULT 300,
        "resend_cooldown_seconds" integer NOT NULL DEFAULT 60,
        "max_attempts" integer NOT NULL DEFAULT 5,
        "updated_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      CREATE TABLE "customer_mfa" (
        "customer_id" uuid PRIMARY KEY,
        "enabled" boolean NOT NULL DEFAULT false,
        "preferred_channel" varchar(10),
        "enabled_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      CREATE TABLE "mfa_challenges" (
        "id" uuid PRIMARY KEY,
        "customer_id" uuid NOT NULL,
        "purpose" varchar(20) NOT NULL,
        "channel" varchar(10) NOT NULL,
        "destination" varchar(191) NOT NULL,
        "otp_hash" varchar(255) NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX "IDX_mfa_challenges_customer_id" ON "mfa_challenges" ("customer_id")`);

    await q.query(`
      CREATE TABLE "mfa_pre_auth" (
        "id" uuid PRIMARY KEY,
        "customer_id" uuid NOT NULL,
        "challenge_id" uuid NOT NULL,
        "token_hash" varchar(255) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX "IDX_mfa_pre_auth_token_hash" ON "mfa_pre_auth" ("token_hash")`);

    // Seed the single global policy row (launch defaults). Idempotent: only inserts if empty.
    await q.query(`
      INSERT INTO "mfa_settings" ("id", "sms_enabled", "email_enabled", "enforcement_mode")
      SELECT gen_random_uuid(), false, true, 'optional'
      WHERE NOT EXISTS (SELECT 1 FROM "mfa_settings")
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "IDX_mfa_pre_auth_token_hash"`);
    await q.query(`DROP TABLE IF EXISTS "mfa_pre_auth"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_mfa_challenges_customer_id"`);
    await q.query(`DROP TABLE IF EXISTS "mfa_challenges"`);
    await q.query(`DROP TABLE IF EXISTS "customer_mfa"`);
    await q.query(`DROP TABLE IF EXISTS "mfa_settings"`);
  }
}
