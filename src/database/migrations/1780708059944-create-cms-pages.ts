import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CMS Page (SRS 13 §8) — the first CMS backend table. Unique slug, SEO meta, publish + is_system flags,
 * soft-delete. Real system-clock epoch (> the facet-definition migration).
 */
export class CreateCmsPages1780708059944 implements MigrationInterface {
  name = 'CreateCmsPages1780708059944';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "cms_pages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug" varchar(140) NOT NULL,
        "title" varchar(160) NOT NULL,
        "body" text NOT NULL,
        "seo_title" varchar(160),
        "seo_description" varchar(300),
        "is_published" boolean NOT NULL DEFAULT false,
        "is_system" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz
      )
    `);
    await q.query(`CREATE UNIQUE INDEX "uq_cms_pages_slug" ON "cms_pages" ("slug")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "cms_pages"`);
  }
}
