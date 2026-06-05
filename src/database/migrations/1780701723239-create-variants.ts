import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Configurable variants (SRS 02 §8): `product_configurable_attributes` (the axes a configurable
 * product varies on), `product_variants` (generated SKUs — stable `variant_id`, globally-unique
 * `sku_code`, nullable price_override/image_id, is_enabled, soft-delete), and
 * `product_variant_options` (each variant's option coordinate, unique on (variant, attribute)).
 * Timestamp is the real system-clock epoch.
 */
export class CreateVariants1780701723239 implements MigrationInterface {
  name = 'CreateVariants1780701723239';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "product_configurable_attributes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "product_id" uuid NOT NULL,
        "attribute_id" uuid NOT NULL,
        "position" integer NOT NULL DEFAULT 0,
        CONSTRAINT "fk_pca_product" FOREIGN KEY ("product_id")
          REFERENCES "products" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_pca_attribute" FOREIGN KEY ("attribute_id")
          REFERENCES "attributes" ("id") ON DELETE RESTRICT
      )
    `);
    await q.query(`CREATE INDEX "idx_pca_product" ON "product_configurable_attributes" ("product_id")`);
    await q.query(
      `CREATE UNIQUE INDEX "uq_pca_product_attribute" ON "product_configurable_attributes" ("product_id", "attribute_id")`,
    );

    await q.query(`
      CREATE TABLE "product_variants" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "product_id" uuid NOT NULL,
        "sku_code" varchar(64) NOT NULL,
        "price_override" numeric(12,2),
        "image_id" uuid,
        "is_enabled" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "fk_pv_product" FOREIGN KEY ("product_id")
          REFERENCES "products" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_pv_image" FOREIGN KEY ("image_id")
          REFERENCES "product_images" ("id") ON DELETE SET NULL
      )
    `);
    await q.query(`CREATE INDEX "idx_pv_product" ON "product_variants" ("product_id")`);
    await q.query(`CREATE UNIQUE INDEX "uq_pv_sku_code" ON "product_variants" ("sku_code")`);

    await q.query(`
      CREATE TABLE "product_variant_options" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "variant_id" uuid NOT NULL,
        "attribute_id" uuid NOT NULL,
        "option_id" uuid NOT NULL,
        CONSTRAINT "fk_pvo_variant" FOREIGN KEY ("variant_id")
          REFERENCES "product_variants" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_pvo_attribute" FOREIGN KEY ("attribute_id")
          REFERENCES "attributes" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_pvo_option" FOREIGN KEY ("option_id")
          REFERENCES "attribute_options" ("id") ON DELETE RESTRICT
      )
    `);
    await q.query(`CREATE INDEX "idx_pvo_variant" ON "product_variant_options" ("variant_id")`);
    await q.query(
      `CREATE UNIQUE INDEX "uq_pvo_variant_attribute" ON "product_variant_options" ("variant_id", "attribute_id")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "product_variant_options"`);
    await q.query(`DROP TABLE IF EXISTS "product_variants"`);
    await q.query(`DROP TABLE IF EXISTS "product_configurable_attributes"`);
  }
}
