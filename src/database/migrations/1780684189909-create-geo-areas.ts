import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BD administrative-geography reference table (SRS 04 §8 GeoArea, FR-CART-044). One row per
 * (division → district → upazila/thana) carrying the `delivery_zone` it resolves to (seeded by
 * the §Appendix-A rule, admin-overridable per FR-CART-047). `(district, upazila)` is unique so
 * zone resolution (FR-CART-046) is deterministic and the seed is idempotent. Reference data —
 * no soft delete; `is_active` toggles selectability in address forms. Timestamp is the real
 * system-clock epoch at creation.
 */
export class CreateGeoAreas1780684189909 implements MigrationInterface {
  name = 'CreateGeoAreas1780684189909';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "geo_areas" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "division" varchar(40) NOT NULL,
        "district" varchar(40) NOT NULL,
        "upazila" varchar(60) NOT NULL,
        "delivery_zone" varchar(16) NOT NULL,
        "postal_code" varchar(10),
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX "idx_geo_areas_division" ON "geo_areas" ("division")`);
    await q.query(`CREATE INDEX "idx_geo_areas_district" ON "geo_areas" ("district")`);
    await q.query(
      `CREATE UNIQUE INDEX "uq_geo_areas_district_upazila" ON "geo_areas" ("district", "upazila")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "geo_areas"`);
  }
}
