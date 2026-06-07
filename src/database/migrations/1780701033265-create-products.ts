import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Catalog product spine (SRS 02 §8): `products` (the typed simple/configurable aggregate against a
 * family + globally-unique SKU/slug, soft-delete), `product_attribute_values` (typed-column EAV),
 * `product_categories` (additional browsing categories), `product_images` (renditions JSON + required
 * alt + one primary), `product_videos`, and `product_links` (typed merchandising links). `sku`/`slug`
 * are unique across ALL rows (incl. soft-deleted) to preserve indexed URLs/SKUs. Stock is never
 * stored here — read live from `INV` (BR-CAT-5). Timestamp is the real system-clock epoch.
 */
export class CreateProducts1780701033265 implements MigrationInterface {
  name = 'CreateProducts1780701033265';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "products" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "type" varchar(16) NOT NULL DEFAULT 'simple',
        "family_id" uuid NOT NULL,
        "sku" varchar(64) NOT NULL,
        "name" varchar(180) NOT NULL,
        "slug" varchar(200) NOT NULL,
        "brand" varchar(80),
        "short_description" text,
        "description" text,
        "base_price" numeric(12,2) NOT NULL,
        "sale_price" numeric(12,2),
        "sale_starts_at" timestamptz,
        "sale_ends_at" timestamptz,
        "status" varchar(16) NOT NULL DEFAULT 'draft',
        "is_featured" boolean NOT NULL DEFAULT false,
        "is_new" boolean NOT NULL DEFAULT false,
        "weight" numeric(8,3),
        "primary_category_id" uuid NOT NULL,
        "primary_image_id" uuid,
        "meta_title" varchar(160),
        "meta_keywords" varchar(255),
        "meta_description" varchar(320),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "fk_products_family" FOREIGN KEY ("family_id")
          REFERENCES "attribute_families" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_products_primary_category" FOREIGN KEY ("primary_category_id")
          REFERENCES "categories" ("id") ON DELETE RESTRICT
      )
    `);
    await q.query(`CREATE UNIQUE INDEX "uq_products_sku" ON "products" ("sku")`);
    await q.query(`CREATE UNIQUE INDEX "uq_products_slug" ON "products" ("slug")`);
    await q.query(`CREATE INDEX "idx_products_status" ON "products" ("status")`);
    await q.query(`CREATE INDEX "idx_products_family" ON "products" ("family_id")`);
    await q.query(
      `CREATE INDEX "idx_products_primary_category" ON "products" ("primary_category_id")`,
    );

    await q.query(`
      CREATE TABLE "product_attribute_values" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "product_id" uuid NOT NULL,
        "attribute_id" uuid NOT NULL,
        "option_id" uuid,
        "value_text" text,
        "value_decimal" numeric(14,4),
        "value_boolean" boolean,
        "value_datetime" timestamptz,
        CONSTRAINT "fk_pav_product" FOREIGN KEY ("product_id")
          REFERENCES "products" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_pav_attribute" FOREIGN KEY ("attribute_id")
          REFERENCES "attributes" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_pav_option" FOREIGN KEY ("option_id")
          REFERENCES "attribute_options" ("id") ON DELETE RESTRICT
      )
    `);
    await q.query(`CREATE INDEX "idx_pav_product" ON "product_attribute_values" ("product_id")`);
    await q.query(
      `CREATE INDEX "idx_pav_attribute" ON "product_attribute_values" ("attribute_id")`,
    );
    // option_id may be NULL (non-select values); the unique guard uses COALESCE to a sentinel.
    await q.query(
      `CREATE UNIQUE INDEX "uq_pav_product_attr_option" ON "product_attribute_values"
        ("product_id", "attribute_id", COALESCE("option_id", '00000000-0000-0000-0000-000000000000'))`,
    );

    await q.query(`
      CREATE TABLE "product_categories" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "product_id" uuid NOT NULL,
        "category_id" uuid NOT NULL,
        CONSTRAINT "fk_pc_product" FOREIGN KEY ("product_id")
          REFERENCES "products" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_pc_category" FOREIGN KEY ("category_id")
          REFERENCES "categories" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "idx_pc_product" ON "product_categories" ("product_id")`);
    await q.query(
      `CREATE UNIQUE INDEX "uq_pc_product_category" ON "product_categories" ("product_id", "category_id")`,
    );

    await q.query(`
      CREATE TABLE "product_images" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "product_id" uuid NOT NULL,
        "url" varchar(500) NOT NULL,
        "renditions" jsonb,
        "alt_text" varchar(160) NOT NULL,
        "color_option_id" uuid,
        "is_primary" boolean NOT NULL DEFAULT false,
        "display_order" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_pi_product" FOREIGN KEY ("product_id")
          REFERENCES "products" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_pi_color_option" FOREIGN KEY ("color_option_id")
          REFERENCES "attribute_options" ("id") ON DELETE SET NULL
      )
    `);
    await q.query(`CREATE INDEX "idx_pi_product" ON "product_images" ("product_id")`);

    await q.query(`
      CREATE TABLE "product_videos" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "product_id" uuid NOT NULL,
        "source" varchar(10) NOT NULL,
        "url" varchar(500) NOT NULL,
        "display_order" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_pvid_product" FOREIGN KEY ("product_id")
          REFERENCES "products" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "idx_pvid_product" ON "product_videos" ("product_id")`);

    await q.query(`
      CREATE TABLE "product_links" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "product_id" uuid NOT NULL,
        "linked_product_id" uuid NOT NULL,
        "type" varchar(16) NOT NULL,
        "position" integer NOT NULL DEFAULT 0,
        CONSTRAINT "fk_pl_product" FOREIGN KEY ("product_id")
          REFERENCES "products" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_pl_linked" FOREIGN KEY ("linked_product_id")
          REFERENCES "products" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "idx_pl_product" ON "product_links" ("product_id")`);
    await q.query(
      `CREATE UNIQUE INDEX "uq_pl_product_linked_type" ON "product_links" ("product_id", "linked_product_id", "type")`,
    );

    // The primary-image FK is added after product_images exists (mutual reference).
    await q.query(
      `ALTER TABLE "products" ADD CONSTRAINT "fk_products_primary_image"
        FOREIGN KEY ("primary_image_id") REFERENCES "product_images" ("id") ON DELETE SET NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "fk_products_primary_image"`);
    await q.query(`DROP TABLE IF EXISTS "product_links"`);
    await q.query(`DROP TABLE IF EXISTS "product_videos"`);
    await q.query(`DROP TABLE IF EXISTS "product_images"`);
    await q.query(`DROP TABLE IF EXISTS "product_categories"`);
    await q.query(`DROP TABLE IF EXISTS "product_attribute_values"`);
    await q.query(`DROP TABLE IF EXISTS "products"`);
  }
}
