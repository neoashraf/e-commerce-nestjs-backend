import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PROMO coupons (SRS 14 §8): `coupons` (definition + conditions + running total_used, soft-delete) and
 * `coupon_redemptions` (append-only ledger written by the engine, retained across coupon soft-delete).
 * Case-insensitive unique code enforced via a functional unique index on UPPER(code). Real system-clock
 * epoch (> the cms-merchandising migration).
 */
export class CreatePromotions1780709147186 implements MigrationInterface {
  name = 'CreatePromotions1780709147186';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "coupons" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" varchar(40) NOT NULL,
        "description" varchar(160),
        "discount_type" varchar(16) NOT NULL,
        "value" numeric(12,2) NOT NULL DEFAULT 0,
        "max_discount_amount" numeric(12,2),
        "min_order_subtotal" numeric(12,2),
        "eligibility_scope" varchar(16) NOT NULL DEFAULT 'all',
        "eligible_category_ids" uuid[] NOT NULL DEFAULT '{}',
        "eligible_product_ids" uuid[] NOT NULL DEFAULT '{}',
        "starts_at" timestamptz NOT NULL,
        "ends_at" timestamptz NOT NULL,
        "total_usage_limit" integer,
        "per_customer_limit" integer,
        "first_order_only" boolean NOT NULL DEFAULT false,
        "total_used" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz
      )
    `);
    // Case-insensitive uniqueness among non-deleted coupons (BR-PROMO-1).
    await q.query(
      `CREATE UNIQUE INDEX "uq_coupons_code_ci" ON "coupons" (UPPER("code")) WHERE "deleted_at" IS NULL`,
    );

    await q.query(`
      CREATE TABLE "coupon_redemptions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "coupon_id" uuid NOT NULL,
        "order_id" uuid NOT NULL,
        "customer_id" uuid,
        "guest_phone" varchar(16),
        "discount_amount" numeric(12,2) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'applied',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "reversed_at" timestamptz,
        CONSTRAINT "fk_redemption_coupon" FOREIGN KEY ("coupon_id")
          REFERENCES "coupons" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "idx_redemptions_coupon" ON "coupon_redemptions" ("coupon_id")`);
    await q.query(`CREATE INDEX "idx_redemptions_order" ON "coupon_redemptions" ("order_id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "coupon_redemptions"`);
    await q.query(`DROP TABLE IF EXISTS "coupons"`);
  }
}
