import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * RW6 (rw6-listing-card-fields): add the storefront product-card data fields.
 *
 * CAT — `products.name_bn`: the one genuinely new column (nullable Bangla product name; no
 * Bangla-name attribute existed in the family model). Admin-editable later.
 *
 * SRCH — `product_search_document`: five denormalized projections the storefront card renders
 * (the mirror is the shared source for listing, search, showcase, new-arrivals, best-selling):
 *   - `name_bn`         mirrors products.name_bn
 *   - `hover_image`     2nd listing-rendition image (next after primary by display_order)
 *   - `swatches`        jsonb [] of { image, label, color_hex } flattened from the color attribute (≤6)
 *   - `requires_variant`true for configurable products, false for simple
 *   - `merch_label`     'new' (from is_new) | 'bestSeller' | 'authentic' | null
 * The mirror is rebuilt by SearchIndexer (reindex / publish hooks), so existing rows backfill on the
 * next reindex; the columns ship with safe defaults so unindexed rows still read.
 *
 * Additive + backward-compatible (all nullable / defaulted). Real system-clock epoch
 * (> backfill-variant-inventory-records 1781171906623).
 */
export class AddListingCardFields1781340573671 implements MigrationInterface {
  name = 'AddListingCardFields1781340573671';

  public async up(q: QueryRunner): Promise<void> {
    // CAT: the one new column.
    await q.query(`ALTER TABLE "products" ADD COLUMN "name_bn" varchar(180)`);

    // SRCH: denormalized card projections.
    await q.query(`ALTER TABLE "product_search_document" ADD COLUMN "name_bn" varchar(180)`);
    await q.query(`ALTER TABLE "product_search_document" ADD COLUMN "hover_image" varchar(500)`);
    await q.query(
      `ALTER TABLE "product_search_document" ADD COLUMN "swatches" jsonb NOT NULL DEFAULT '[]'`,
    );
    await q.query(
      `ALTER TABLE "product_search_document" ADD COLUMN "requires_variant" boolean NOT NULL DEFAULT false`,
    );
    await q.query(`ALTER TABLE "product_search_document" ADD COLUMN "merch_label" varchar(16)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "product_search_document" DROP COLUMN "merch_label"`);
    await q.query(`ALTER TABLE "product_search_document" DROP COLUMN "requires_variant"`);
    await q.query(`ALTER TABLE "product_search_document" DROP COLUMN "swatches"`);
    await q.query(`ALTER TABLE "product_search_document" DROP COLUMN "hover_image"`);
    await q.query(`ALTER TABLE "product_search_document" DROP COLUMN "name_bn"`);
    await q.query(`ALTER TABLE "products" DROP COLUMN "name_bn"`);
  }
}
