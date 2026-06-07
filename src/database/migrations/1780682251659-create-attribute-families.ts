import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Catalog attribute-family schema (SRS 02 §8): `attribute_families` + `attribute_groups` +
 * `family_attributes` — the per-product-type template layer (FR-CAT-060/061). Family `code`
 * is globally unique; an attribute appears at most once per family (unique family_id,
 * attribute_id). Timestamp is the real system-clock epoch at creation (migration-timestamp rule).
 */
export class CreateAttributeFamilies1780682251659 implements MigrationInterface {
  name = 'CreateAttributeFamilies1780682251659';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "attribute_families" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" varchar(60) NOT NULL,
        "name" varchar(80) NOT NULL,
        "is_default" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX "uq_attribute_families_code" ON "attribute_families" ("code")`,
    );

    await q.query(`
      CREATE TABLE "attribute_groups" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "family_id" uuid NOT NULL,
        "name" varchar(80) NOT NULL,
        "column" integer NOT NULL DEFAULT 1,
        "position" integer NOT NULL DEFAULT 0,
        CONSTRAINT "fk_attribute_groups_family" FOREIGN KEY ("family_id")
          REFERENCES "attribute_families" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(
      `CREATE INDEX "idx_attribute_groups_family" ON "attribute_groups" ("family_id")`,
    );

    await q.query(`
      CREATE TABLE "family_attributes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "family_id" uuid NOT NULL,
        "group_id" uuid NOT NULL,
        "attribute_id" uuid NOT NULL,
        "position" integer NOT NULL DEFAULT 0,
        CONSTRAINT "fk_family_attributes_family" FOREIGN KEY ("family_id")
          REFERENCES "attribute_families" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_family_attributes_group" FOREIGN KEY ("group_id")
          REFERENCES "attribute_groups" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_family_attributes_attribute" FOREIGN KEY ("attribute_id")
          REFERENCES "attributes" ("id") ON DELETE RESTRICT
      )
    `);
    await q.query(
      `CREATE INDEX "idx_family_attributes_family" ON "family_attributes" ("family_id")`,
    );
    await q.query(
      `CREATE INDEX "idx_family_attributes_group" ON "family_attributes" ("group_id")`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "uq_family_attributes_family_attribute" ON "family_attributes" ("family_id", "attribute_id")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "family_attributes"`);
    await q.query(`DROP TABLE IF EXISTS "attribute_groups"`);
    await q.query(`DROP TABLE IF EXISTS "attribute_families"`);
  }
}
