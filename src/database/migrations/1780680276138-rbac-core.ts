import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * RBAC core schema (SRS 16 §8): roles, permissions, role_permissions, admin_users,
 * admin_sessions, audit_entries — plus two support tables for the documented auth flows
 * (admin_twofa_challenges for FR-RBAC-002, admin_password_reset_tokens for FR-RBAC-007).
 * Timestamp is the real system-clock epoch at creation time (migration-timestamp rule).
 */
export class RbacCore1780680276138 implements MigrationInterface {
  name = 'RbacCore1780680276138';

  public async up(q: QueryRunner): Promise<void> {
    // roles
    await q.query(`
      CREATE TABLE "roles" (
        "id" uuid PRIMARY KEY,
        "name" varchar(80) NOT NULL,
        "description" varchar(255),
        "is_system" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX "uq_roles_name_active" ON "roles" ("name") WHERE "deleted_at" IS NULL`,
    );

    // permissions (seeded catalog, read-only; code is PK)
    await q.query(`
      CREATE TABLE "permissions" (
        "code" varchar(80) PRIMARY KEY,
        "module" varchar(40) NOT NULL,
        "description" varchar(160) NOT NULL
      )
    `);
    await q.query(`CREATE INDEX "idx_permissions_module" ON "permissions" ("module")`);

    // role_permissions (join)
    await q.query(`
      CREATE TABLE "role_permissions" (
        "role_id" uuid NOT NULL,
        "permission_code" varchar(80) NOT NULL,
        CONSTRAINT "pk_role_permissions" PRIMARY KEY ("role_id", "permission_code"),
        CONSTRAINT "fk_role_permissions_role" FOREIGN KEY ("role_id")
          REFERENCES "roles" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_role_permissions_permission" FOREIGN KEY ("permission_code")
          REFERENCES "permissions" ("code") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "idx_role_permissions_role" ON "role_permissions" ("role_id")`);

    // admin_users
    await q.query(`
      CREATE TABLE "admin_users" (
        "id" uuid PRIMARY KEY,
        "full_name" varchar(120) NOT NULL,
        "email" varchar(160) NOT NULL,
        "phone" varchar(16),
        "password_hash" varchar,
        "role_id" uuid NOT NULL,
        "twofa_enabled" boolean NOT NULL DEFAULT false,
        "twofa_channel" varchar(10),
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "failed_login_attempts" integer NOT NULL DEFAULT 0,
        "locked_until" timestamptz,
        "last_login_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "fk_admin_users_role" FOREIGN KEY ("role_id") REFERENCES "roles" ("id")
      )
    `);
    await q.query(`CREATE INDEX "idx_admin_users_role" ON "admin_users" ("role_id")`);
    await q.query(
      `CREATE UNIQUE INDEX "uq_admin_users_email_active" ON "admin_users" ("email") WHERE "deleted_at" IS NULL`,
    );

    // admin_sessions
    await q.query(`
      CREATE TABLE "admin_sessions" (
        "id" uuid PRIMARY KEY,
        "admin_user_id" uuid NOT NULL,
        "refresh_token_hash" varchar(255) NOT NULL,
        "device_label" varchar(120),
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_admin_sessions_admin" FOREIGN KEY ("admin_user_id")
          REFERENCES "admin_users" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "idx_admin_sessions_admin" ON "admin_sessions" ("admin_user_id")`);
    await q.query(
      `CREATE UNIQUE INDEX "uq_admin_sessions_refresh_hash" ON "admin_sessions" ("refresh_token_hash")`,
    );

    // audit_entries (append-only)
    await q.query(`
      CREATE TABLE "audit_entries" (
        "id" uuid PRIMARY KEY,
        "actor_admin_id" uuid,
        "action" varchar(80) NOT NULL,
        "entity_type" varchar(60),
        "entity_id" uuid,
        "summary" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "ip_address" varchar(45),
        "result" varchar(20) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX "idx_audit_actor" ON "audit_entries" ("actor_admin_id")`);
    await q.query(`CREATE INDEX "idx_audit_action" ON "audit_entries" ("action")`);
    await q.query(`CREATE INDEX "idx_audit_entity_type" ON "audit_entries" ("entity_type")`);
    await q.query(`CREATE INDEX "idx_audit_created" ON "audit_entries" ("created_at")`);

    // admin_twofa_challenges (support state for FR-RBAC-002)
    await q.query(`
      CREATE TABLE "admin_twofa_challenges" (
        "id" uuid PRIMARY KEY,
        "admin_user_id" uuid NOT NULL,
        "otp_hash" varchar(255) NOT NULL,
        "channel" varchar(10) NOT NULL,
        "remember_device" boolean NOT NULL DEFAULT false,
        "attempts" integer NOT NULL DEFAULT 0,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_twofa_admin" FOREIGN KEY ("admin_user_id")
          REFERENCES "admin_users" ("id") ON DELETE CASCADE
      )
    `);

    // admin_password_reset_tokens (support state for FR-RBAC-007)
    await q.query(`
      CREATE TABLE "admin_password_reset_tokens" (
        "id" uuid PRIMARY KEY,
        "admin_user_id" uuid NOT NULL,
        "token_hash" varchar(255) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_reset_admin" FOREIGN KEY ("admin_user_id")
          REFERENCES "admin_users" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "idx_reset_admin" ON "admin_password_reset_tokens" ("admin_user_id")`);
    await q.query(
      `CREATE UNIQUE INDEX "uq_reset_token_hash" ON "admin_password_reset_tokens" ("token_hash")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "admin_password_reset_tokens"`);
    await q.query(`DROP TABLE IF EXISTS "admin_twofa_challenges"`);
    await q.query(`DROP TABLE IF EXISTS "audit_entries"`);
    await q.query(`DROP TABLE IF EXISTS "admin_sessions"`);
    await q.query(`DROP TABLE IF EXISTS "admin_users"`);
    await q.query(`DROP TABLE IF EXISTS "role_permissions"`);
    await q.query(`DROP TABLE IF EXISTS "permissions"`);
    await q.query(`DROP TABLE IF EXISTS "roles"`);
  }
}
