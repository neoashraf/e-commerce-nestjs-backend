import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SRCH FacetDefinition (SRS 03 §8) + launch-facet seed (SRS §16 resolved set): Category, Brand, Color,
 * Size, Price, Availability, On-sale + the Appendix-B attribute facets (Gender, Sport, Surface/Ground,
 * Material, Performance Tier, Product Type). `key` is unique; `source=attribute` maps to a CAT
 * Attribute.code. Real system-clock epoch (> the search-index migration).
 */
export class CreateFacetDefinition1780707305312 implements MigrationInterface {
  name = 'CreateFacetDefinition1780707305312';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "facet_definition" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "key" varchar(60) NOT NULL,
        "label" varchar(80) NOT NULL,
        "type" varchar(16) NOT NULL,
        "source" varchar(24) NOT NULL,
        "source_attribute_key" varchar(60),
        "is_multi_select" boolean NOT NULL DEFAULT true,
        "hide_zero_counts" boolean NOT NULL DEFAULT true,
        "display_order" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE UNIQUE INDEX "uq_facet_key" ON "facet_definition" ("key")`);

    // Launch facet seed. (attribute, key, label, type, source, source_attribute_key, multi, order)
    const seed: [string, string, string, string, string | null, boolean, number][] = [
      ['category', 'Category', 'term', 'category', null, true, 1],
      ['brand', 'Brand', 'term', 'brand', null, true, 2],
      ['gender', 'Gender', 'term', 'attribute', 'gender', true, 3],
      ['sport', 'Sport', 'term', 'attribute', 'sport', true, 4],
      ['surface', 'Surface / Ground', 'term', 'attribute', 'surface', true, 5],
      ['material', 'Material', 'term', 'attribute', 'material', true, 6],
      ['performance_tier', 'Performance Tier', 'term', 'attribute', 'performance_tier', true, 7],
      ['product_type', 'Product Type', 'term', 'attribute', 'product_type', true, 8],
      ['color', 'Color', 'term', 'variant_color', null, true, 9],
      ['size', 'Size', 'term', 'variant_size', null, true, 10],
      ['price', 'Price', 'range', 'price', null, false, 11],
      ['availability', 'Availability', 'boolean', 'availability', null, false, 12],
      ['on_sale', 'On Sale', 'boolean', 'attribute', null, false, 13],
    ];
    for (const [key, label, type, source, attrKey, multi, order] of seed) {
      await q.query(
        `INSERT INTO "facet_definition"
           ("key","label","type","source","source_attribute_key","is_multi_select","hide_zero_counts","display_order","is_active")
         VALUES ($1,$2,$3,$4,$5,$6,true,$7,true)`,
        [key, label, type, source, attrKey, multi, order],
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "facet_definition"`);
  }
}
