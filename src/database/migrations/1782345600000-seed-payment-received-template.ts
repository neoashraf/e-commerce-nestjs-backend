import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seed the customer `payment.received` email template (FR-ORD-050 → FR-NOTIF-030/031) so a successful
 * online payment sends the buyer a confirmation email. `email` / `en`; placeholders `name`, `order_no`,
 * `amount` (the event catalog's required ∪ optional set). Idempotent — re-running inserts nothing if an
 * active template already exists for the (event_type, channel, locale) triple (matches the partial
 * unique index). Mirrors the lead-template seed migration.
 */
export class SeedPaymentReceivedTemplate1782345600000 implements MigrationInterface {
  name = 'SeedPaymentReceivedTemplate1782345600000';

  private readonly subject = 'Payment received for order {{order_no}}';

  private readonly body = [
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937">',
    '  <h2 style="margin:0 0 12px;color:#111827">Payment received</h2>',
    '  <p>Hi {{name}},</p>',
    '  <p>We have received your payment for order <strong>{{order_no}}</strong>'
      + ' (amount: <strong>৳{{amount}}</strong>). Your order is now confirmed and is being prepared.</p>',
    '  <p>Thank you for shopping with SportShop.</p>',
    '  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">',
    '  <p style="font-size:12px;color:#9ca3af">SportShop · automated message, please do not reply.</p>',
    '</div>',
  ].join('\n');

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "notification_templates" ("id","event_type","channel","locale","subject","body","version","is_active")
       SELECT gen_random_uuid(), 'payment.received', 'email', 'en', $1::varchar, $2::text, 1, true
       WHERE NOT EXISTS (
         SELECT 1 FROM "notification_templates"
         WHERE "event_type" = 'payment.received' AND "channel" = 'email' AND "locale" = 'en' AND "is_active" = true
       )`,
      [this.subject, this.body],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "notification_templates"
       WHERE "event_type" = 'payment.received' AND "channel" = 'email' AND "locale" = 'en'`,
    );
  }
}
