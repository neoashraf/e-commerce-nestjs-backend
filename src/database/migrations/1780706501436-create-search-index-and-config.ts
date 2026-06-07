import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SRCH index + config (SRS 03 §8). Creates the denormalized `product_search_document` mirror (one row
 * per published product) with a maintained `search_tsv` tsvector (GENERATED from `search_text`, using
 * the `simple` FTS config so UTF-8/Bangla tokens are not English-stemmed, §12.10) plus a GIN FTS index
 * and a `pg_trgm` GIN index on `search_text` for typo-tolerant fuzzy matching (FR-SRCH-011). Also the
 * synonym / redirect config tables and the append-only query log. Real system-clock epoch.
 */
export class CreateSearchIndexAndConfig1780706501436 implements MigrationInterface {
  name = 'CreateSearchIndexAndConfig1780706501436';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);

    // --- product_search_document (index mirror) ---
    await q.query(`
      CREATE TABLE "product_search_document" (
        "product_id" uuid PRIMARY KEY,
        "slug" varchar(200) NOT NULL,
        "title" varchar(180) NOT NULL,
        "brand" varchar(80),
        "category_path" text,
        "search_text" text NOT NULL DEFAULT '',
        "primary_image" varchar(500),
        "effective_price" numeric(12,2) NOT NULL,
        "base_price" numeric(12,2) NOT NULL,
        "on_sale" boolean NOT NULL DEFAULT false,
        "availability" varchar(16) NOT NULL DEFAULT 'in_stock',
        "best_selling_score" double precision NOT NULL DEFAULT 0,
        "published_at" timestamptz,
        "category_ids" uuid[] NOT NULL DEFAULT '{}',
        "attributes" jsonb NOT NULL DEFAULT '{}',
        "colors" uuid[] NOT NULL DEFAULT '{}',
        "sizes" uuid[] NOT NULL DEFAULT '{}',
        "search_tsv" tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce("search_text", ''))) STORED,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX "idx_psd_tsv" ON "product_search_document" USING GIN ("search_tsv")`);
    await q.query(
      `CREATE INDEX "idx_psd_trgm" ON "product_search_document" USING GIN ("search_text" gin_trgm_ops)`,
    );
    await q.query(`CREATE INDEX "idx_psd_category_ids" ON "product_search_document" USING GIN ("category_ids")`);
    await q.query(`CREATE INDEX "idx_psd_colors" ON "product_search_document" USING GIN ("colors")`);
    await q.query(`CREATE INDEX "idx_psd_sizes" ON "product_search_document" USING GIN ("sizes")`);
    await q.query(`CREATE INDEX "idx_psd_attributes" ON "product_search_document" USING GIN ("attributes")`);
    await q.query(`CREATE INDEX "idx_psd_price" ON "product_search_document" ("effective_price")`);
    await q.query(`CREATE INDEX "idx_psd_published" ON "product_search_document" ("published_at")`);

    // --- search_synonym ---
    await q.query(`
      CREATE TABLE "search_synonym" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "terms" text[] NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // --- search_redirect ---
    await q.query(`
      CREATE TABLE "search_redirect" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "query_pattern" varchar(120) NOT NULL,
        "target_type" varchar(16) NOT NULL,
        "target_ref" varchar(255) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX "idx_redirect_pattern" ON "search_redirect" ("query_pattern")`);

    // --- search_query_log (append-only) ---
    await q.query(`
      CREATE TABLE "search_query_log" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "query_text" varchar(255) NOT NULL,
        "normalized_text" varchar(255) NOT NULL,
        "result_count" integer NOT NULL DEFAULT 0,
        "had_results" boolean NOT NULL DEFAULT false,
        "customer_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX "idx_qlog_normalized" ON "search_query_log" ("normalized_text")`);
    await q.query(`CREATE INDEX "idx_qlog_had_results" ON "search_query_log" ("had_results")`);
    await q.query(`CREATE INDEX "idx_qlog_created" ON "search_query_log" ("created_at")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "search_query_log"`);
    await q.query(`DROP TABLE IF EXISTS "search_redirect"`);
    await q.query(`DROP TABLE IF EXISTS "search_synonym"`);
    await q.query(`DROP TABLE IF EXISTS "product_search_document"`);
  }
}
