import 'dotenv/config';
import { join } from 'path';
import { DataSource } from 'typeorm';

/**
 * Jest global setup for the e2e suite. The e2e specs run against a dedicated
 * `e_commerce_test` database and assume its schema already exists (see
 * `support/e2e-env.ts`). This makes that precondition self-contained: it creates
 * the database if missing and runs all migrations, so `npm run test:e2e` works
 * from a clean machine (and hardens CI) without a manual pre-migrate step.
 *
 * Idempotent: an existing DB is reused and only pending migrations run.
 */
const TEST_DB = 'e_commerce_test';

export default async function globalSetup(): Promise<void> {
  const host = process.env.DB_HOST ?? 'localhost';
  const port = Number(process.env.DB_PORT ?? 5432);
  const username = process.env.DB_USERNAME ?? 'postgres';
  const password = process.env.DB_PASSWORD ?? '';

  // 1) Ensure the test database exists — connect to the always-present `postgres`
  //    maintenance DB and CREATE it if missing (CREATE DATABASE can't run in a tx,
  //    so this uses a plain autocommit query).
  const admin = new DataSource({ type: 'postgres', host, port, username, password, database: 'postgres' });
  await admin.initialize();
  try {
    const rows: unknown[] = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DB]);
    if (rows.length === 0) {
      await admin.query(`CREATE DATABASE "${TEST_DB}"`);
      // eslint-disable-next-line no-console
      console.log(`[e2e globalSetup] created database "${TEST_DB}"`);
    }
  } finally {
    await admin.destroy();
  }

  // 2) Run migrations against it (idempotent — only pending ones apply).
  const ds = new DataSource({
    type: 'postgres',
    host,
    port,
    username,
    password,
    database: TEST_DB,
    entities: [join(__dirname, '../../src/domains/**/infrastructure/persistence/typeorm/entities/*.orm-entity{.ts,.js}')],
    migrations: [join(__dirname, '../../src/database/migrations/*{.ts,.js}')],
    synchronize: false,
  });
  await ds.initialize();
  try {
    const applied = await ds.runMigrations();
    // eslint-disable-next-line no-console
    console.log(`[e2e globalSetup] ${TEST_DB} ready — ${applied.length} migration(s) applied.`);
  } finally {
    await ds.destroy();
  }
}
