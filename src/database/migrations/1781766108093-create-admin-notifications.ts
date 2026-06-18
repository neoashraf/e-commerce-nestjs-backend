import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * NOTIF (SRS 09 §8): `admin_notifications` — the in-app admin notification feed (FR-NOTIF-070–076).
 * One row per recipient admin (fan-out on write) so read state is per-admin (BR-NOTIF-12). The
 * partial-unique `(recipient_admin_id, idempotency_key)` collapses a re-fired trigger to a single
 * row per admin (FR-NOTIF-076). First trigger is `order.placed` from ORD (FR-ORD-050a).
 * Real system-clock epoch (> backfill-simple-product-implicit-variants 1781510571106).
 */
export class CreateAdminNotifications1781766108093 implements MigrationInterface {
  name = 'CreateAdminNotifications1781766108093';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "admin_notifications" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "recipient_admin_id" uuid NOT NULL,
        "event_type" varchar(60) NOT NULL,
        "type" varchar(40) NOT NULL,
        "title" varchar(160) NOT NULL,
        "body" varchar(255),
        "link" varchar(255),
        "data" jsonb,
        "related_entity_type" varchar(60),
        "related_entity_id" uuid,
        "is_read" boolean NOT NULL DEFAULT false,
        "read_at" timestamptz,
        "idempotency_key" varchar(140),
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    // Feed reads: a single admin's notifications, most-recent-first, and unread filtering/counting.
    await q.query(
      `CREATE INDEX "idx_admin_notifications_recipient_created" ON "admin_notifications" ("recipient_admin_id", "created_at")`,
    );
    await q.query(
      `CREATE INDEX "idx_admin_notifications_recipient_unread" ON "admin_notifications" ("recipient_admin_id", "is_read")`,
    );
    // Dedupe: at most one row per (admin, idempotency_key) — re-fired triggers no-op (FR-NOTIF-076).
    await q.query(
      `CREATE UNIQUE INDEX "uq_admin_notifications_recipient_idem" ON "admin_notifications" ("recipient_admin_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "uq_admin_notifications_recipient_idem"`);
    await q.query(`DROP INDEX IF EXISTS "idx_admin_notifications_recipient_unread"`);
    await q.query(`DROP INDEX IF EXISTS "idx_admin_notifications_recipient_created"`);
    await q.query(`DROP TABLE IF EXISTS "admin_notifications"`);
  }
}
