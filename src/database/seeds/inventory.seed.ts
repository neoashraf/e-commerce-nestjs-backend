import 'dotenv/config';

import { AppDataSource } from '../data-source';

/**
 * Idempotent inventory seed (FR-INV-002). Creates an `inventory` record for every existing
 * `CAT.ProductVariant` that lacks one, with a deterministic spread of stock + thresholds so the
 * admin list and the batch status read have realistic in/low/out data. Rerunning inserts nothing
 * new (skips variants that already have a record).
 * Run: `npm run seed:inventory`
 */
async function seed(): Promise<void> {
  const ds = await AppDataSource.initialize();

  const variants: { id: string; product_id: string }[] = await ds.query(
    `SELECT pv."id", pv."product_id"
       FROM "product_variants" pv
       LEFT JOIN "inventory" inv ON inv."variant_id" = pv."id"
      WHERE inv."id" IS NULL AND pv."deleted_at" IS NULL`,
  );

  // Deterministic spread: index % 3 → out (0) / low (2, thr 3) / in (25, thr 3).
  const spread = [
    { onHand: 0, threshold: 3 }, // out_of_stock
    { onHand: 2, threshold: 3 }, // low_stock
    { onHand: 25, threshold: 3 }, // in_stock
  ];

  let created = 0;
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const s = spread[i % spread.length];
    await ds.query(
      `INSERT INTO "inventory"
         ("id","variant_id","product_id","on_hand","reserved","available","low_stock_threshold")
       VALUES (gen_random_uuid(),$1,$2,$3,0,$3,$4)
       ON CONFLICT ("variant_id") DO NOTHING`,
      [v.id, v.product_id, s.onHand, s.threshold],
    );
    created += 1;
  }

  console.log(`Inventory seed complete: ${created} new record(s) for ${variants.length} variant(s).`);
  await ds.destroy();
}

seed().catch((err) => {
  console.error('Inventory seed failed:', err);
  process.exit(1);
});
