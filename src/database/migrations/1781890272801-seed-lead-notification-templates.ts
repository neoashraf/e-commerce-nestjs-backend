import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seed the LEAD email templates (FR-LEAD-005, FR-LEAD-013): `lead.received_ack` (submission
 * acknowledgement) and `lead.reply` (admin reply), both `email` / `en`. Email-only per the client
 * decision. Idempotent — re-running inserts nothing if an active template already exists for the
 * (event_type, channel, locale) triple (matches the partial unique index).
 */
export class SeedLeadNotificationTemplates1781890272801 implements MigrationInterface {
  name = 'SeedLeadNotificationTemplates1781890272801';

  private readonly templates: Array<{ event: string; subject: string; body: string }> = [
    {
      event: 'lead.received_ack',
      subject: "We've received your enquiry ({{ticket_no}})",
      body:
        'Hi {{name}}, thanks for contacting SportShop. We have received your enquiry — your reference is ' +
        '{{ticket_no}}. Our team will get back to you shortly.',
    },
    {
      event: 'lead.reply',
      subject: 'Re: your enquiry {{ticket_no}}',
      body:
        'Hi {{name}}, regarding your enquiry {{ticket_no}}:\n\n{{reply_body}}\n\n— SportShop Support',
    },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const t of this.templates) {
      await queryRunner.query(
        `INSERT INTO "notification_templates" ("id","event_type","channel","locale","subject","body","version","is_active")
         SELECT gen_random_uuid(), $1::varchar, 'email', 'en', $2::varchar, $3::text, 1, true
         WHERE NOT EXISTS (
           SELECT 1 FROM "notification_templates"
           WHERE "event_type" = $1 AND "channel" = 'email' AND "locale" = 'en' AND "is_active" = true
         )`,
        [t.event, t.subject, t.body],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "notification_templates"
       WHERE "channel" = 'email' AND "locale" = 'en' AND "event_type" IN ('lead.received_ack', 'lead.reply')`,
    );
  }
}
