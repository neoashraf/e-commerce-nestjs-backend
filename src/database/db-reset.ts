import 'dotenv/config';
import { DataSource } from 'typeorm';

/**
 * Drops and recreates the application database. The `db:reset` npm script then re-runs migrations +
 * all seeds. DESTRUCTIVE — local development only. Connects to the maintenance `postgres` database to
 * issue DROP/CREATE, and uses WITH (FORCE) to terminate any open connections (PostgreSQL 13+).
 * Run (full reset): `npm run db:reset`
 */
async function reset(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('db:reset is blocked when NODE_ENV=production.');
  }

  const name = process.env.DB_NAME ?? 'e-commerce';
  const quoted = `"${name.replace(/"/g, '""')}"`;

  // Connect to the maintenance `postgres` DB — you cannot drop the database you are connected to.
  const admin = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: 'postgres',
  });

  await admin.initialize();
  await admin.query(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${quoted}`);
  await admin.destroy();

  console.log(`Database "${name}" dropped and recreated.`);
}

reset().catch((err) => {
  console.error('db:reset failed:', err);
  process.exit(1);
});
