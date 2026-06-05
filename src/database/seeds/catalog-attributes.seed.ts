import 'dotenv/config';

import { AppDataSource } from '../data-source';

/**
 * Idempotent catalog attribute seed (FR-CAT-059): the non-deletable **system attributes**
 * (`is_user_defined = false`) and the editable **Appendix-B sport attributes** with their
 * options/swatches and configurable/filterable flags. Rerunning inserts nothing new
 * (ON CONFLICT on `attributes.code` and `attribute_options (attribute_id, value)`).
 * Run: `npm run seed:catalog-attributes`
 */

interface SeedOption {
  value: string;
  label: string;
  swatchType?: 'color' | 'image';
  swatchValue?: string;
}

interface SeedAttribute {
  code: string;
  adminLabel: string;
  type: string;
  isRequired?: boolean;
  isUnique?: boolean;
  isFilterable?: boolean;
  isConfigurable?: boolean;
  isVisibleOnFront?: boolean;
  isComparable?: boolean;
  isUserDefined: boolean;
  options?: SeedOption[];
}

// Mandatory system attributes — non-deletable (FR-CAT-059, FR-CAT-062).
const SYSTEM_ATTRIBUTES: SeedAttribute[] = [
  { code: 'sku', adminLabel: 'SKU', type: 'text', isRequired: true, isUnique: true, isVisibleOnFront: false, isUserDefined: false },
  { code: 'name', adminLabel: 'Name', type: 'text', isRequired: true, isVisibleOnFront: false, isUserDefined: false },
  { code: 'url_key', adminLabel: 'URL Key', type: 'text', isRequired: true, isUnique: true, isVisibleOnFront: false, isUserDefined: false },
  { code: 'price', adminLabel: 'Price', type: 'price', isRequired: true, isVisibleOnFront: false, isUserDefined: false },
  { code: 'description', adminLabel: 'Description', type: 'rich_text', isVisibleOnFront: true, isUserDefined: false },
  { code: 'short_description', adminLabel: 'Short Description', type: 'textarea', isVisibleOnFront: true, isUserDefined: false },
  {
    code: 'status',
    adminLabel: 'Status',
    type: 'select',
    isVisibleOnFront: false,
    isUserDefined: false,
    options: [
      { value: 'draft', label: 'Draft' },
      { value: 'published', label: 'Published' },
      { value: 'archived', label: 'Archived' },
    ],
  },
  { code: 'brand', adminLabel: 'Brand', type: 'text', isFilterable: true, isVisibleOnFront: true, isComparable: true, isUserDefined: false },
];

// Appendix-B standard sport attributes — editable / deletable when unreferenced.
const SPORT_ATTRIBUTES: SeedAttribute[] = [
  {
    code: 'color',
    adminLabel: 'Color',
    type: 'select',
    isConfigurable: true,
    isFilterable: true,
    isVisibleOnFront: true,
    isComparable: true,
    isUserDefined: true,
    options: [
      { value: 'black', label: 'Black', swatchType: 'color', swatchValue: '#000000' },
      { value: 'white', label: 'White', swatchType: 'color', swatchValue: '#FFFFFF' },
      { value: 'red', label: 'Red', swatchType: 'color', swatchValue: '#FF0000' },
      { value: 'blue', label: 'Blue', swatchType: 'color', swatchValue: '#0000FF' },
      { value: 'green', label: 'Green', swatchType: 'color', swatchValue: '#008000' },
      { value: 'yellow', label: 'Yellow', swatchType: 'color', swatchValue: '#FFD700' },
    ],
  },
  {
    code: 'size',
    adminLabel: 'Size',
    type: 'select',
    isConfigurable: true,
    isFilterable: true,
    isVisibleOnFront: true,
    isUserDefined: true,
    options: [
      { value: 'eu_40', label: 'EU 40' },
      { value: 'eu_41', label: 'EU 41' },
      { value: 'eu_42', label: 'EU 42' },
      { value: 'eu_43', label: 'EU 43' },
      { value: 'eu_44', label: 'EU 44' },
      { value: 's', label: 'S' },
      { value: 'm', label: 'M' },
      { value: 'l', label: 'L' },
      { value: 'xl', label: 'XL' },
      { value: 'xxl', label: 'XXL' },
    ],
  },
  {
    code: 'gender',
    adminLabel: 'Gender',
    type: 'select',
    isFilterable: true,
    isVisibleOnFront: true,
    isComparable: true,
    isUserDefined: true,
    options: [
      { value: 'men', label: 'Men' },
      { value: 'women', label: 'Women' },
      { value: 'kids', label: 'Kids' },
      { value: 'unisex', label: 'Unisex' },
    ],
  },
  {
    code: 'sport',
    adminLabel: 'Sport',
    type: 'multiselect',
    isFilterable: true,
    isVisibleOnFront: true,
    isUserDefined: true,
    options: [
      { value: 'football', label: 'Football' },
      { value: 'futsal', label: 'Futsal' },
      { value: 'turf', label: 'Turf' },
      { value: 'running', label: 'Running' },
      { value: 'training', label: 'Training' },
      { value: 'lifestyle', label: 'Lifestyle' },
    ],
  },
  {
    code: 'surface_type',
    adminLabel: 'Surface / Ground',
    type: 'multiselect',
    isFilterable: true,
    isVisibleOnFront: true,
    isUserDefined: true,
    options: [
      { value: 'fg', label: 'Firm Ground (FG)' },
      { value: 'sg', label: 'Soft Ground (SG)' },
      { value: 'ag', label: 'Artificial Ground (AG)' },
      { value: 'tf', label: 'Turf (TF)' },
      { value: 'in', label: 'Indoor (IN)' },
    ],
  },
  {
    code: 'material',
    adminLabel: 'Upper Material',
    type: 'select',
    isFilterable: true,
    isVisibleOnFront: true,
    isComparable: true,
    isUserDefined: true,
    options: [
      { value: 'synthetic', label: 'Synthetic' },
      { value: 'leather', label: 'Leather' },
      { value: 'knit', label: 'Knit' },
      { value: 'mesh', label: 'Mesh' },
    ],
  },
  {
    code: 'tier',
    adminLabel: 'Performance Tier',
    type: 'select',
    isFilterable: true,
    isVisibleOnFront: true,
    isComparable: true,
    isUserDefined: true,
    options: [
      { value: 'elite', label: 'Elite' },
      { value: 'pro', label: 'Pro' },
      { value: 'league', label: 'League' },
      { value: 'club', label: 'Club' },
    ],
  },
  {
    code: 'product_type',
    adminLabel: 'Product Type',
    type: 'select',
    isFilterable: true,
    isVisibleOnFront: true,
    isUserDefined: true,
    options: [
      { value: 'boots', label: 'Boots' },
      { value: 'jersey', label: 'Jersey' },
      { value: 'turf_shoe', label: 'Turf Shoe' },
      { value: 'futsal_shoe', label: 'Futsal Shoe' },
      { value: 'accessory', label: 'Accessory' },
    ],
  },
];

async function seed(): Promise<void> {
  const ds = await AppDataSource.initialize();
  const all = [...SYSTEM_ATTRIBUTES, ...SPORT_ATTRIBUTES];

  let position = 0;
  for (const a of all) {
    position += 1;
    await ds.query(
      `INSERT INTO "attributes"
         ("code","admin_label","type","is_required","is_unique","is_filterable",
          "is_configurable","is_visible_on_front","is_comparable","is_user_defined","position","is_active")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)
       ON CONFLICT ("code") DO NOTHING`,
      [
        a.code,
        a.adminLabel,
        a.type,
        a.isRequired ?? false,
        a.isUnique ?? false,
        a.isFilterable ?? false,
        a.isConfigurable ?? false,
        a.isVisibleOnFront ?? true,
        a.isComparable ?? false,
        a.isUserDefined,
        position,
      ],
    );

    const rows = await ds.query(`SELECT "id" FROM "attributes" WHERE "code"=$1`, [a.code]);
    const attributeId: string = rows[0].id;

    let optionPosition = 0;
    for (const o of a.options ?? []) {
      optionPosition += 1;
      await ds.query(
        `INSERT INTO "attribute_options"
           ("attribute_id","value","label","swatch_type","swatch_value","position")
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT ("attribute_id","value") DO NOTHING`,
        [attributeId, o.value, o.label, o.swatchType ?? null, o.swatchValue ?? null, optionPosition],
      );
    }
  }

  const counts = await ds.query(
    `SELECT
       (SELECT count(*)::int FROM "attributes") AS attributes,
       (SELECT count(*)::int FROM "attributes" WHERE "is_user_defined" = false) AS system_attributes,
       (SELECT count(*)::int FROM "attribute_options") AS attribute_options`,
  );
  console.log('Catalog attribute seed complete:', counts[0]);
  await ds.destroy();
}

seed().catch((err) => {
  console.error('Catalog attribute seed failed:', err);
  process.exit(1);
});
