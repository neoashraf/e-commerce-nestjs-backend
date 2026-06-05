import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Catalog category schema (SRS 02 §8): `categories` (the 3-level tree) + `category_filterable_attributes`
 * (the per-category layered-nav facet set, FR-CAT-009). `slug` is globally unique across all rows
 * (incl. soft-deleted, to preserve indexed URLs — BR-CAT-3/8); `level` is denormalized (1–3, BR-CAT-1);
 * `slug_locked` records first-publish to freeze the slug. An attribute appears at most once per
 * category (unique category_id, attribute_id). Timestamp is the real system-clock epoch at creation.
 */
export class CreateCategories1780683380548 implements MigrationInterface {
  name = 'CreateCategories1780683380548';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "categories" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "parent_id" uuid,
        "name" varchar(120) NOT NULL,
        "slug" varchar(140) NOT NULL,
        "description" text,
        "image_url" varchar(500),
        "logo_url" varchar(500),
        "banner_url" varchar(500),
        "display_mode" varchar(32) NOT NULL DEFAULT 'products_and_description',
        "position" integer NOT NULL DEFAULT 0,
        "is_published" boolean NOT NULL DEFAULT false,
        "show_in_menu" boolean NOT NULL DEFAULT true,
        "level" integer NOT NULL DEFAULT 1,
        "slug_locked" boolean NOT NULL DEFAULT false,
        "meta_title" varchar(160),
        "meta_keywords" varchar(255),
        "meta_description" varchar(320),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "fk_categories_parent" FOREIGN KEY ("parent_id")
          REFERENCES "categories" ("id") ON DELETE RESTRICT
      )
    `);
    await q.query(`CREATE UNIQUE INDEX "uq_categories_slug" ON "categories" ("slug")`);
    await q.query(`CREATE INDEX "idx_categories_parent" ON "categories" ("parent_id")`);

    await q.query(`
      CREATE TABLE "category_filterable_attributes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "category_id" uuid NOT NULL,
        "attribute_id" uuid NOT NULL,
        "position" integer NOT NULL DEFAULT 0,
        CONSTRAINT "fk_cfa_category" FOREIGN KEY ("category_id")
          REFERENCES "categories" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_cfa_attribute" FOREIGN KEY ("attribute_id")
          REFERENCES "attributes" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(
      `CREATE INDEX "idx_cfa_category" ON "category_filterable_attributes" ("category_id")`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "uq_cfa_category_attribute" ON "category_filterable_attributes" ("category_id", "attribute_id")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "category_filterable_attributes"`);
    await q.query(`DROP TABLE IF EXISTS "categories"`);
  }
}
