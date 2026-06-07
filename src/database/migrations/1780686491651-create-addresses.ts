import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AUTH address book (SRS 01 §5.6, §8 Address): a customer's saved delivery addresses, each
 * resolving to a `delivery_zone` (FR-AUTH-050/051). The partial unique index enforces the
 * single-default invariant at the data layer (BR-AUTH-6, FR-AUTH-052) — at most one active
 * default per customer. Timestamp is the real system-clock epoch at creation time.
 */
export class CreateAddresses1780686491651 implements MigrationInterface {
  name = 'CreateAddresses1780686491651';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "addresses" (
        "id" uuid PRIMARY KEY,
        "customer_id" uuid NOT NULL,
        "recipient_name" varchar(120) NOT NULL,
        "recipient_phone" varchar(16) NOT NULL,
        "address_line" varchar(255) NOT NULL,
        "area" varchar(120) NOT NULL,
        "district" varchar(80) NOT NULL,
        "division" varchar(80) NOT NULL,
        "postal_code" varchar(10),
        "delivery_zone" varchar(20) NOT NULL,
        "is_default" boolean NOT NULL DEFAULT false,
        "last_used_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "fk_addresses_customer" FOREIGN KEY ("customer_id")
          REFERENCES "customers" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_addresses_customer" ON "addresses" ("customer_id")`,
    );
    // Exactly one active default per customer (BR-AUTH-6).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_addresses_one_default" ON "addresses" ("customer_id") WHERE "is_default" = true AND "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_addresses_one_default"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_addresses_customer"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "addresses"`);
  }
}
