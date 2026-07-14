import 'dotenv/config';
import * as bcrypt from 'bcrypt';

import { AppDataSource } from '../data-source';
import {
  PERMISSION_CATALOG,
  SUPER_ADMIN_ROLE_NAME,
  SYSTEM_ROLES,
} from '../../domains/rbac/domain/permission-catalog';

/**
 * Idempotent RBAC seed (FR-RBAC-020, 030): the fixed permission catalog, the 4 system
 * roles with their Appendix A permission sets (Super Admin = implicit-all, no rows), and a
 * bootstrap Super Admin from env. Rerunning inserts nothing new.
 * Run: `npm run seed:rbac`
 */
async function seed(): Promise<void> {
  const ds = await AppDataSource.initialize();

  // 1) Permission catalog (PK = code).
  for (const p of PERMISSION_CATALOG) {
    await ds.query(
      `INSERT INTO "permissions" ("code","module","description")
       VALUES ($1,$2,$3) ON CONFLICT ("code") DO NOTHING`,
      [p.code, p.module, p.description],
    );
  }

  // 2) System roles + their permission grants.
  for (const role of SYSTEM_ROLES) {
    let rows = await ds.query(
      `SELECT "id" FROM "roles" WHERE "name"=$1 AND "deleted_at" IS NULL`,
      [role.name],
    );
    if (rows.length === 0) {
      rows = await ds.query(
        `INSERT INTO "roles" ("id","name","description","is_system")
         VALUES (gen_random_uuid(),$1,$2,true) RETURNING "id"`,
        [role.name, role.description],
      );
    }
    const roleId: string = rows[0].id;

    if (role.permissions !== 'ALL') {
      for (const code of role.permissions) {
        await ds.query(
          `INSERT INTO "role_permissions" ("role_id","permission_code")
           VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [roleId, code],
        );
      }
    }
  }

  // 3) Bootstrap Super Admin.
  const email = (process.env.SUPER_ADMIN_SEED_EMAIL ?? 'startsmartztechnologiesbd@gmail.com').toLowerCase();
  const existing = await ds.query(`SELECT "id" FROM "admin_users" WHERE "email"=$1`, [email]);
  if (existing.length === 0) {
    const password = process.env.SUPER_ADMIN_SEED_PASSWORD ?? 'ChangeMe-Admin1';
    const fullName = process.env.SUPER_ADMIN_SEED_NAME ?? 'Super Admin';
    const phone = process.env.SUPER_ADMIN_SEED_PHONE || null;
    const passwordHash = await bcrypt.hash(password, 12);
    const superRole = await ds.query(
      `SELECT "id" FROM "roles" WHERE "name"=$1 AND "deleted_at" IS NULL`,
      [SUPER_ADMIN_ROLE_NAME],
    );
    // 2FA is off by default for every admin (incl. Super Admin) — each opts in later (FR-RBAC-008).
    await ds.query(
      `INSERT INTO "admin_users"
        ("id","full_name","email","phone","password_hash","role_id","twofa_enabled","twofa_channel","status")
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,false,null,'active')`,
      [fullName, email, phone, passwordHash, superRole[0].id],
    );
    console.log(`Bootstrap Super Admin created: ${email}`);
  } else {
    console.log(`Bootstrap Super Admin already exists: ${email}`);
  }

  const counts = await ds.query(
    `SELECT
       (SELECT count(*)::int FROM "permissions") AS permissions,
       (SELECT count(*)::int FROM "roles") AS roles,
       (SELECT count(*)::int FROM "role_permissions") AS role_permissions,
       (SELECT count(*)::int FROM "admin_users") AS admin_users`,
  );
  console.log('Seed complete:', counts[0]);
  await ds.destroy();
}

seed().catch((err) => {
  console.error('RBAC seed failed:', err);
  process.exit(1);
});
