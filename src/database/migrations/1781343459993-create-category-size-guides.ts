import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * RW6 (rw6-pdp-size-guide): `category_size_guides` — one optional footwear size chart per category.
 * The PDP `size_guide` on GET /products/{slug} resolves to the nearest ancestor category that has a
 * row (child inherits parent). PK = category_id; rows is a jsonb array of { uk, foot } string pairs.
 * Real system-clock epoch (> add-listing-card-fields 1781340573671).
 */
export class CreateCategorySizeGuides1781343459993 implements MigrationInterface {
  name = 'CreateCategorySizeGuides1781343459993';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "category_size_guides" (
        "category_id"  uuid NOT NULL,
        "measure_note" text NOT NULL,
        "unit"         varchar(8) NOT NULL DEFAULT 'cm',
        "rows"         jsonb NOT NULL DEFAULT '[]',
        "created_at"   TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_category_size_guides" PRIMARY KEY ("category_id")
      )
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "category_size_guides"`);
  }
}
