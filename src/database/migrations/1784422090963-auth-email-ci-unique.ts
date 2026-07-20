import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Case-insensitive email uniqueness for active customers (BR-AUTH-1). The app already
 * normalizes emails on write, but only a DB-level index defends against a race between two
 * concurrent registrations. Uses a partial expression index so soft-deleted rows
 * (`deleted_at IS NOT NULL`) and rows with NULL email don't participate.
 */
export class AuthEmailCiUnique1784422090963 implements MigrationInterface {
  name = 'AuthEmailCiUnique1784422090963';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "ux_customers_email_ci_active"
       ON "customers" (LOWER("email"))
       WHERE "email" IS NOT NULL AND "deleted_at" IS NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "ux_customers_email_ci_active"`);
  }
}
