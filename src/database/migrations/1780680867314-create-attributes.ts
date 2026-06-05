import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Catalog attribute schema (SRS 02 §8): `attributes` + `attribute_options` — the EAV
 * foundation (FR-CAT-050/051). `code` is globally unique; option `value` is unique per
 * attribute. Timestamp is the real system-clock epoch at creation (migration-timestamp rule).
 */
export class CreateAttributes1780680867314 implements MigrationInterface {
  name = 'CreateAttributes1780680867314';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "attributes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" varchar(60) NOT NULL,
        "admin_label" varchar(80) NOT NULL,
        "type" varchar(20) NOT NULL,
        "is_required" boolean NOT NULL DEFAULT false,
        "is_unique" boolean NOT NULL DEFAULT false,
        "is_filterable" boolean NOT NULL DEFAULT false,
        "is_configurable" boolean NOT NULL DEFAULT false,
        "is_visible_on_front" boolean NOT NULL DEFAULT true,
        "is_comparable" boolean NOT NULL DEFAULT false,
        "is_user_defined" boolean NOT NULL DEFAULT true,
        "validation" varchar(120),
        "default_value" varchar(160),
        "position" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE UNIQUE INDEX "uq_attributes_code" ON "attributes" ("code")`);
    await q.query(`CREATE INDEX "idx_attributes_type" ON "attributes" ("type")`);

    await q.query(`
      CREATE TABLE "attribute_options" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "attribute_id" uuid NOT NULL,
        "value" varchar(60) NOT NULL,
        "label" varchar(80) NOT NULL,
        "swatch_type" varchar(10),
        "swatch_value" varchar(120),
        "position" integer NOT NULL DEFAULT 0,
        CONSTRAINT "fk_attribute_options_attribute" FOREIGN KEY ("attribute_id")
          REFERENCES "attributes" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(
      `CREATE INDEX "idx_attribute_options_attribute" ON "attribute_options" ("attribute_id")`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "uq_attribute_options_attr_value" ON "attribute_options" ("attribute_id", "value")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "attribute_options"`);
    await q.query(`DROP TABLE IF EXISTS "attributes"`);
  }
}
