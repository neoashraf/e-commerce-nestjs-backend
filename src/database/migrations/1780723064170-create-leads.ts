import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * LEAD (SRS 08 §8): `leads` (enquiry with a unique `HLP-` reference, submitter contact, type/status,
 * optional customer/order/product links), `lead_messages` (threaded conversation; `is_internal_note`
 * rows stay admin-only), and `lead_attachments` (claim evidence; `lead_id` null until a claim_return
 * submission binds them). `lead_reference_seq` backs the human-readable reference (FR-LEAD-002). The
 * `order_reference` column retains the submitter's typed order number even when ORD can't yet resolve it
 * to an `order_id` (§12.2 flag-not-fail). Real system-clock epoch (> create-wishlist 1780721873402).
 */
export class CreateLeads1780723064170 implements MigrationInterface {
  name = 'CreateLeads1780723064170';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TYPE "lead_type_enum" AS ENUM ('general','product','order_issue','claim_return','bulk_order','feedback')`,
    );
    await q.query(
      `CREATE TYPE "lead_status_enum" AS ENUM ('new','open','awaiting_customer','resolved','closed','spam')`,
    );
    await q.query(`CREATE TYPE "lead_source_enum" AS ENUM ('get_help','contact_page','product_page')`);
    await q.query(`CREATE TYPE "lead_message_direction_enum" AS ENUM ('inbound','outbound')`);
    await q.query(`CREATE TYPE "lead_message_channel_enum" AS ENUM ('email','sms')`);

    // Human-readable reference sequence (HLP-<n>). Starts well above 0 to look like a real ticket number.
    await q.query(`CREATE SEQUENCE "lead_reference_seq" START WITH 20001 INCREMENT BY 1`);

    await q.query(`
      CREATE TABLE "leads" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "reference" varchar(20) NOT NULL,
        "type" "lead_type_enum" NOT NULL,
        "subject" varchar(160) NOT NULL,
        "message" text NOT NULL,
        "submitter_name" varchar(120) NOT NULL,
        "submitter_phone" varchar(16) NOT NULL,
        "submitter_email" varchar(160),
        "customer_id" uuid,
        "order_id" uuid,
        "order_reference" varchar(40),
        "product_id" uuid,
        "status" "lead_status_enum" NOT NULL DEFAULT 'new',
        "assigned_admin_id" uuid,
        "source" "lead_source_enum" NOT NULL DEFAULT 'get_help',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE UNIQUE INDEX "uq_leads_reference" ON "leads" ("reference")`);
    await q.query(`CREATE INDEX "idx_leads_customer" ON "leads" ("customer_id")`);
    await q.query(`CREATE INDEX "idx_leads_status" ON "leads" ("status")`);
    await q.query(`CREATE INDEX "idx_leads_type" ON "leads" ("type")`);

    await q.query(`
      CREATE TABLE "lead_messages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "lead_id" uuid NOT NULL,
        "direction" "lead_message_direction_enum" NOT NULL,
        "author_admin_id" uuid,
        "body" text NOT NULL,
        "channel" "lead_message_channel_enum",
        "is_internal_note" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_lead_messages_lead" FOREIGN KEY ("lead_id")
          REFERENCES "leads" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "idx_lead_messages_lead" ON "lead_messages" ("lead_id")`);

    await q.query(`
      CREATE TABLE "lead_attachments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "lead_id" uuid,
        "url" text NOT NULL,
        "content_type" varchar(80) NOT NULL,
        "size_bytes" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_lead_attachments_lead" FOREIGN KEY ("lead_id")
          REFERENCES "leads" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "idx_lead_attachments_lead" ON "lead_attachments" ("lead_id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_lead_attachments_lead"`);
    await q.query(`DROP TABLE IF EXISTS "lead_attachments"`);
    await q.query(`DROP INDEX IF EXISTS "idx_lead_messages_lead"`);
    await q.query(`DROP TABLE IF EXISTS "lead_messages"`);
    await q.query(`DROP INDEX IF EXISTS "idx_leads_type"`);
    await q.query(`DROP INDEX IF EXISTS "idx_leads_status"`);
    await q.query(`DROP INDEX IF EXISTS "idx_leads_customer"`);
    await q.query(`DROP INDEX IF EXISTS "uq_leads_reference"`);
    await q.query(`DROP TABLE IF EXISTS "leads"`);
    await q.query(`DROP SEQUENCE IF EXISTS "lead_reference_seq"`);
    await q.query(`DROP TYPE IF EXISTS "lead_message_channel_enum"`);
    await q.query(`DROP TYPE IF EXISTS "lead_message_direction_enum"`);
    await q.query(`DROP TYPE IF EXISTS "lead_source_enum"`);
    await q.query(`DROP TYPE IF EXISTS "lead_status_enum"`);
    await q.query(`DROP TYPE IF EXISTS "lead_type_enum"`);
  }
}
