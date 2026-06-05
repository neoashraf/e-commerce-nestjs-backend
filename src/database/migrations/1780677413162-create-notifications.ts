import { MigrationInterface, QueryRunner } from 'typeorm';

/** NOTIF dispatch schema: notifications, notification_templates, channel_provider_config (SRS 09 §8). */
export class CreateNotifications1780677413162 implements MigrationInterface {
  name = 'CreateNotifications1780677413162';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid PRIMARY KEY,
        "event_type" varchar(60) NOT NULL,
        "category" varchar(20) NOT NULL,
        "channel" varchar(10) NOT NULL,
        "locale" varchar(10) NOT NULL DEFAULT 'en',
        "customer_id" uuid,
        "admin_user_id" uuid,
        "recipient_address" varchar(200) NOT NULL,
        "related_entity_type" varchar(40),
        "related_entity_id" uuid,
        "template_id" uuid,
        "template_version" integer,
        "rendered_subject" varchar(255),
        "rendered_body" text NOT NULL,
        "sms_segments" integer,
        "sms_sender_route" varchar(20),
        "provider_message_ref" varchar(120),
        "status" varchar(20) NOT NULL DEFAULT 'queued',
        "failure_reason" varchar(160),
        "attempts" integer NOT NULL DEFAULT 0,
        "idempotency_key" varchar(160),
        "resent_from_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_notif_idempotency" ON "notifications" ("idempotency_key")`);
    await queryRunner.query(`CREATE INDEX "idx_notif_provider_ref" ON "notifications" ("provider_message_ref")`);

    await queryRunner.query(`
      CREATE TABLE "notification_templates" (
        "id" uuid PRIMARY KEY,
        "event_type" varchar(60) NOT NULL,
        "channel" varchar(10) NOT NULL,
        "locale" varchar(10) NOT NULL,
        "subject" varchar(255),
        "body" text NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_template_event_channel_locale_active" ON "notification_templates" ("event_type", "channel", "locale") WHERE "is_active" = true`,
    );

    await queryRunner.query(`
      CREATE TABLE "channel_provider_config" (
        "id" uuid PRIMARY KEY,
        "channel" varchar(10) NOT NULL,
        "provider_name" varchar(60),
        "non_masking_sender" varchar(40),
        "masked_sender_id" varchar(20),
        "transactional_from" varchar(160),
        "credentials_ref" varchar(200),
        "quiet_hours_start" varchar(5),
        "quiet_hours_end" varchar(5),
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "channel_provider_config"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_templates"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
  }
}
