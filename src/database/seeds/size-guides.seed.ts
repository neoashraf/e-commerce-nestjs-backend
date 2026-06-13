import 'dotenv/config';
import { AppDataSource } from '../data-source';

/**
 * RW6 (rw6-pdp-size-guide) — PLACEHOLDER footwear size guide.
 *
 * ⚠️ PLACEHOLDER DATA — the UK↔foot-length numbers below are a representative chart for wiring/QA only.
 * The CLIENT must confirm the real measurements before launch. The chart is attached to footwear
 * categories by slug; products inherit the nearest ancestor category's chart, so attaching it to the
 * top footwear categories covers their subcategories. Idempotent (re-running upserts the same rows).
 * Run: `npm run seed:size-guides`
 */
const FOOTWEAR_CATEGORY_SLUGS = ['football-boots', 'turf', 'futsal'];

const MEASURE_NOTE =
  'Measure your foot from heel to toe (standing) and match it to the closest length below. ' +
  'If you are between sizes, size up. PLACEHOLDER — client to confirm.';
const UNIT = 'cm';

// Representative UK↔cm footwear chart (PLACEHOLDER — not client-confirmed).
const ROWS: { uk: string; foot: string }[] = [
  { uk: '5', foot: '23.5' },
  { uk: '6', foot: '24.5' },
  { uk: '7', foot: '25.4' },
  { uk: '8', foot: '26.3' },
  { uk: '9', foot: '27.3' },
  { uk: '10', foot: '28.2' },
  { uk: '11', foot: '29.2' },
];

async function seed(): Promise<void> {
  const ds = await AppDataSource.initialize();
  let attached = 0;
  for (const slug of FOOTWEAR_CATEGORY_SLUGS) {
    const cat: Array<{ id: string }> = await ds.query(
      `SELECT id FROM "categories" WHERE "slug" = $1 AND "deleted_at" IS NULL LIMIT 1`,
      [slug],
    );
    if (cat.length === 0) continue; // category not seeded in this DB — skip silently
    await ds.query(
      `INSERT INTO "category_size_guides" ("category_id","measure_note","unit","rows")
       VALUES ($1,$2,$3,$4::jsonb)
       ON CONFLICT ("category_id") DO UPDATE
         SET "measure_note" = EXCLUDED."measure_note",
             "unit" = EXCLUDED."unit",
             "rows" = EXCLUDED."rows",
             "updated_at" = now()`,
      [cat[0].id, MEASURE_NOTE, UNIT, JSON.stringify(ROWS)],
    );
    attached += 1;
  }
  console.log(
    `Seed complete. PLACEHOLDER size guides attached to ${attached} footwear category(ies). ` +
      `⚠️ Client must confirm the real measurements.`,
  );
  await ds.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
