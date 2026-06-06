import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * WISH (SRS 07 §8): `wishlists` (one per customer — unique `customer_id`, BR-WISH-1) and `wishlist_items`
 * (product + optional preferred variant references; no price/stock columns — read live from CAT/INV,
 * BR-WISH-2). Unique on `(wishlist_id, product_id, preferred_variant_id)` (nulls distinct, §12.7) drives
 * idempotent adds; `added_at` drives most-recent-first ordering (FR-WISH-013). Real system-clock epoch
 * (> create-exchanges 1780719939096).
 */
export class CreateWishlist1780721873402 implements MigrationInterface {
  name = 'CreateWishlist1780721873402';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "wishlists" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "customer_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    // One wishlist per customer (BR-WISH-1, AC1).
    await q.query(
      `CREATE UNIQUE INDEX "uq_wishlists_customer" ON "wishlists" ("customer_id")`,
    );

    await q.query(`
      CREATE TABLE "wishlist_items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "wishlist_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "preferred_variant_id" uuid,
        "added_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_wishlist_items_wishlist" FOREIGN KEY ("wishlist_id")
          REFERENCES "wishlists" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "idx_wishlist_items_wishlist" ON "wishlist_items" ("wishlist_id")`);
    // Set semantics: same (product, preferred variant) cannot repeat in a wishlist (BR-WISH-1, §12.7).
    // Nulls are distinct (Postgres default) so the same product with two preferred sizes = two items;
    // idempotency for the null-variant case is enforced in the service layer (FR-WISH-002).
    await q.query(
      `CREATE UNIQUE INDEX "uq_wishlist_item" ON "wishlist_items" ("wishlist_id", "product_id", "preferred_variant_id")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "uq_wishlist_item"`);
    await q.query(`DROP INDEX IF EXISTS "idx_wishlist_items_wishlist"`);
    await q.query(`DROP TABLE IF EXISTS "wishlist_items"`);
    await q.query(`DROP INDEX IF EXISTS "uq_wishlists_customer"`);
    await q.query(`DROP TABLE IF EXISTS "wishlists"`);
  }
}
