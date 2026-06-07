import 'dotenv/config';

import { AppDataSource } from '../data-source';

/**
 * Idempotent catalog attribute-family seed (FR-CAT-063): the non-deletable **Default** family
 * (`is_default = true`) plus the five seeded **sport families** (Appendix B), each grouping the
 * mandatory system attributes (`sku`, `name`, `url_key`, `price`, `status`, `description`) and the
 * notable Appendix-B attributes into ordered groups. Reruns add nothing (a family already present
 * by `code` is skipped wholesale). Requires the catalog-attributes seed to have run first.
 * Run: `npm run seed:catalog-families`
 */

interface FamilySpec {
  code: string;
  name: string;
  isDefault?: boolean;
  /** Configurable (variant-forming) attributes placed in the General group. */
  configurable: string[];
  /** Notable Appendix-B attributes (beyond system + Color/Size). */
  notable: string[];
}

interface GroupSpec {
  name: string;
  column: number;
  position: number;
  attributeCodes: string[];
}

const FAMILIES: FamilySpec[] = [
  { code: 'default', name: 'Default', isDefault: true, configurable: [], notable: ['gender', 'brand'] },
  {
    code: 'mens_footwear',
    name: 'Mens Footwear',
    configurable: ['color', 'size'],
    notable: ['gender', 'sport', 'surface_type', 'material', 'tier', 'product_type'],
  },
  {
    code: 'womens_footwear',
    name: 'Womens Footwear',
    configurable: ['color', 'size'],
    notable: ['gender', 'sport', 'surface_type', 'material', 'tier', 'product_type'],
  },
  {
    code: 'kids',
    name: 'Kids',
    configurable: ['color', 'size'],
    notable: ['gender', 'sport', 'product_type', 'material'],
  },
  {
    code: 'apparel',
    name: 'Apparel / Clothing',
    configurable: ['color', 'size'],
    notable: ['gender', 'sport', 'material', 'product_type'],
  },
  {
    code: 'accessories',
    name: 'Accessories',
    configurable: ['color'],
    notable: ['gender', 'sport', 'product_type'],
  },
];

/** Lay out a family's attributes into ordered groups; every mandatory system attribute included. */
function buildGroups(spec: FamilySpec): GroupSpec[] {
  const general = ['sku', 'name', 'brand', ...spec.configurable];
  if (spec.notable.includes('gender')) general.push('gender');
  const specs = spec.notable.filter((c) => c !== 'gender' && c !== 'brand');

  const groups: GroupSpec[] = [
    { name: 'General', column: 1, position: 1, attributeCodes: general },
    { name: 'Description', column: 1, position: 2, attributeCodes: ['short_description', 'description'] },
    { name: 'Price', column: 2, position: 1, attributeCodes: ['price'] },
  ];
  let position = 2;
  if (specs.length > 0) {
    groups.push({ name: 'Specifications', column: 2, position: position++, attributeCodes: specs });
  }
  groups.push({ name: 'Meta', column: 2, position, attributeCodes: ['url_key', 'status'] });
  return groups;
}

async function seed(): Promise<void> {
  const ds = await AppDataSource.initialize();

  // Resolve all attribute codes to ids up front.
  const attrRows: Array<{ id: string; code: string }> = await ds.query(
    `SELECT "id", "code" FROM "attributes"`,
  );
  const codeToId = new Map(attrRows.map((r) => [r.code, r.id]));

  for (const spec of FAMILIES) {
    const existing = await ds.query(`SELECT "id" FROM "attribute_families" WHERE "code" = $1`, [
      spec.code,
    ]);
    if (existing.length > 0) continue; // already seeded — skip wholesale (idempotent)

    const groups = buildGroups(spec);
    // Validate every referenced code resolves before writing anything.
    for (const g of groups) {
      for (const code of g.attributeCodes) {
        if (!codeToId.has(code)) {
          throw new Error(
            `Family "${spec.code}" references unknown attribute "${code}". Run the catalog-attributes seed first.`,
          );
        }
      }
    }

    await ds.transaction(async (manager) => {
      const famRows = await manager.query(
        `INSERT INTO "attribute_families" ("code","name","is_default")
         VALUES ($1,$2,$3) RETURNING "id"`,
        [spec.code, spec.name, spec.isDefault ?? false],
      );
      const familyId: string = famRows[0].id;

      for (const g of groups) {
        const groupRows = await manager.query(
          `INSERT INTO "attribute_groups" ("family_id","name","column","position")
           VALUES ($1,$2,$3,$4) RETURNING "id"`,
          [familyId, g.name, g.column, g.position],
        );
        const groupId: string = groupRows[0].id;

        let position = 0;
        for (const code of g.attributeCodes) {
          position += 1;
          await manager.query(
            `INSERT INTO "family_attributes" ("family_id","group_id","attribute_id","position")
             VALUES ($1,$2,$3,$4)`,
            [familyId, groupId, codeToId.get(code), position],
          );
        }
      }
    });
  }

  const counts = await ds.query(
    `SELECT
       (SELECT count(*)::int FROM "attribute_families") AS families,
       (SELECT count(*)::int FROM "attribute_families" WHERE "is_default" = true) AS default_families,
       (SELECT count(*)::int FROM "attribute_groups") AS groups,
       (SELECT count(*)::int FROM "family_attributes") AS family_attributes`,
  );
  console.log('Catalog family seed complete:', counts[0]);
  await ds.destroy();
}

seed().catch((err) => {
  console.error('Catalog family seed failed:', err);
  process.exit(1);
});
