import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CMS merchandising (SRS 13 §8): slides (hero carousel), banners (placement slots), home sections
 * (curated category/product blocks). All schedule-aware + soft-delete. Real system-clock epoch
 * (> the cms-menus migration).
 */
export class CreateCmsMerchandising1780708684381 implements MigrationInterface {
  name = 'CreateCmsMerchandising1780708684381';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "cms_slides" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "image_url" varchar(500) NOT NULL,
        "renditions" jsonb,
        "alt_text" varchar(160) NOT NULL,
        "headline" varchar(120),
        "subtext" varchar(200),
        "cta_label" varchar(40),
        "link_type" varchar(16) NOT NULL,
        "link_ref" varchar(255) NOT NULL,
        "display_order" integer NOT NULL DEFAULT 0,
        "is_published" boolean NOT NULL DEFAULT false,
        "starts_at" timestamptz,
        "ends_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz
      )
    `);

    await q.query(`
      CREATE TABLE "cms_banners" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "placement" varchar(32) NOT NULL,
        "image_url" varchar(500) NOT NULL,
        "renditions" jsonb,
        "alt_text" varchar(160) NOT NULL,
        "link_type" varchar(16) NOT NULL,
        "link_ref" varchar(255) NOT NULL,
        "priority" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "starts_at" timestamptz,
        "ends_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz
      )
    `);
    await q.query(`CREATE INDEX "idx_banners_placement" ON "cms_banners" ("placement")`);

    await q.query(`
      CREATE TABLE "cms_home_sections" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "type" varchar(32) NOT NULL,
        "title" varchar(120) NOT NULL,
        "display_order" integer NOT NULL DEFAULT 0,
        "item_refs" uuid[] NOT NULL DEFAULT '{}',
        "is_published" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz
      )
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "cms_home_sections"`);
    await q.query(`DROP TABLE IF EXISTS "cms_banners"`);
    await q.query(`DROP TABLE IF EXISTS "cms_slides"`);
  }
}
