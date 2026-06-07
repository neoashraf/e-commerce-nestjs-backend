import 'dotenv/config';

import { AppDataSource } from '../data-source';

/**
 * Idempotent payment-gateway config seed (FR-PAY-060/061). Enables the methods checkout should offer
 * by upserting `gateway_config` rows (a disabled method rejects initiation). The raw store credentials
 * live in env (SSLCOMMERZ_*), never in the DB — `credentials_ref` is only a pointer label (BR-PAY-7).
 * SSLCommerz environment follows SSLCOMMERZ_IS_SANDBOX. Rerunning just re-asserts the flags.
 * Run: `npm run seed:payments`
 */
async function seed(): Promise<void> {
  const ds = await AppDataSource.initialize();
  try {
    const sandbox = (process.env.SSLCOMMERZ_IS_SANDBOX ?? 'true') !== 'false';
    const sslEnv = sandbox ? 'sandbox' : 'live';

    // SSLCommerz — enabled, environment from config.
    await ds.query(
      `INSERT INTO "gateway_config" ("id","method","environment","credentials_ref","is_enabled")
       VALUES (gen_random_uuid(),'sslcommerz',$1,'env://SSLCOMMERZ_*',true)
       ON CONFLICT ("method") DO UPDATE
         SET "environment" = EXCLUDED."environment", "is_enabled" = true, "updated_at" = now()`,
      [sslEnv],
    );

    // COD — always available.
    await ds.query(
      `INSERT INTO "gateway_config" ("id","method","environment","credentials_ref","is_enabled")
       VALUES (gen_random_uuid(),'cod','live',NULL,true)
       ON CONFLICT ("method") DO UPDATE SET "is_enabled" = true, "updated_at" = now()`,
    );

    const rows = await ds.query(
      `SELECT "method","environment","is_enabled" FROM "gateway_config" ORDER BY "method"`,
    );
    console.log('Gateway config seed complete:', rows);
  } finally {
    await ds.destroy();
  }
}

seed().catch((err) => {
  console.error('Gateway config seed failed:', err);
  process.exit(1);
});
