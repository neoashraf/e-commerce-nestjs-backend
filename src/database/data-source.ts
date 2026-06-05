import 'dotenv/config';
import { DataSource } from 'typeorm';

/**
 * Standalone TypeORM DataSource used by the migration CLI scripts
 * (migration:generate / run / revert). The app itself wires TypeOrmModule
 * separately once the first DB-backed module is added.
 *
 * NOTE: never enable `synchronize` — all schema changes go through migrations,
 * and every migration file is named with the REAL system-clock epoch.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'e-commerce',
  entities: ['src/domains/**/infrastructure/persistence/typeorm/entities/*.orm-entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
