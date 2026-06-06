import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CMS MenuItem (SRS 13 §8) — header/footer navigation tree, one level of nesting. Real system-clock
 * epoch (> the cms-pages migration). `cms-pages-be`'s PAGE_LINKED guard reads link_type/link_ref here.
 */
export class CreateCmsMenus1780708399286 implements MigrationInterface {
  name = 'CreateCmsMenus1780708399286';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "cms_menu_items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "menu" varchar(16) NOT NULL,
        "parent_id" uuid,
        "label" varchar(60) NOT NULL,
        "link_type" varchar(16) NOT NULL,
        "link_ref" varchar(255) NOT NULL,
        "display_order" integer NOT NULL DEFAULT 0,
        "is_published" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_menu_item_parent" FOREIGN KEY ("parent_id")
          REFERENCES "cms_menu_items" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "idx_menu_items_menu" ON "cms_menu_items" ("menu")`);
    await q.query(`CREATE INDEX "idx_menu_items_parent" ON "cms_menu_items" ("parent_id")`);
    await q.query(`CREATE INDEX "idx_menu_items_link" ON "cms_menu_items" ("link_type", "link_ref")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "cms_menu_items"`);
  }
}
