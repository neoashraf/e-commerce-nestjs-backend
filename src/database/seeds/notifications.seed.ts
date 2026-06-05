import 'dotenv/config';
import { AppDataSource } from '../data-source';

/**
 * Idempotent seed for the NOTIF dispatch slice: placeholder ChannelProviderConfig (sms/email)
 * + transactional templates for the in-scope OTP/email events. Rerunning inserts nothing new.
 * Run: `npm run seed:notifications`
 */
const OTP_BODY_EN = 'Your SportShop verification code is {{code}}. It expires in {{ttl_minutes}} minutes.';
const OTP_BODY_BN = 'আপনার SportShop ভেরিফিকেশন কোড {{code}}। এটি {{ttl_minutes}} মিনিটে মেয়াদ শেষ হবে।';

interface TemplateSeed {
  event: string;
  channel: 'sms' | 'email';
  locale: string;
  subject: string | null;
  body: string;
}

const TEMPLATES: TemplateSeed[] = [
  { event: 'otp.register', channel: 'sms', locale: 'en', subject: null, body: OTP_BODY_EN },
  { event: 'otp.register', channel: 'sms', locale: 'bn', subject: null, body: OTP_BODY_BN },
  { event: 'otp.login', channel: 'sms', locale: 'en', subject: null, body: OTP_BODY_EN },
  { event: 'otp.login', channel: 'sms', locale: 'bn', subject: null, body: OTP_BODY_BN },
  { event: 'otp.phone_change', channel: 'sms', locale: 'en', subject: null, body: OTP_BODY_EN },
  { event: 'otp.password_reset', channel: 'sms', locale: 'en', subject: null, body: OTP_BODY_EN },
  { event: 'auth.email_verify', channel: 'email', locale: 'en', subject: 'Verify your email', body: 'Hi {{name}}, please verify your email: {{verify_url}}' },
  { event: 'auth.password_reset', channel: 'email', locale: 'en', subject: 'Reset your password', body: 'Hi {{name}}, reset your password: {{reset_url}}' },
  { event: 'admin.invite', channel: 'email', locale: 'en', subject: "You're invited to SportShop Admin", body: 'Hi {{name}}, set your password to activate your admin account: {{invite_url}}' },
  { event: 'admin.password_reset', channel: 'email', locale: 'en', subject: 'Admin password reset', body: 'Hi {{name}}, reset your admin password: {{reset_url}}' },
  { event: 'admin.2fa', channel: 'email', locale: 'en', subject: 'Your admin 2FA code', body: 'Your admin login code is {{code}}.' },
  { event: 'admin.2fa', channel: 'sms', locale: 'en', subject: null, body: 'Your SportShop admin code is {{code}}.' },
];

async function seed(): Promise<void> {
  const ds = await AppDataSource.initialize();

  // ChannelProviderConfig — sms + email
  await ds.query(`
    INSERT INTO "channel_provider_config"
      ("id","channel","provider_name","non_masking_sender","masked_sender_id","credentials_ref","quiet_hours_start","quiet_hours_end","is_active")
    SELECT gen_random_uuid(),'sms','stub','88010000000','SportSBD','secret://notif/sms','22:00','08:00',true
    WHERE NOT EXISTS (SELECT 1 FROM "channel_provider_config" WHERE "channel"='sms')
  `);
  await ds.query(`
    INSERT INTO "channel_provider_config"
      ("id","channel","provider_name","transactional_from","credentials_ref","is_active")
    SELECT gen_random_uuid(),'email','smtp','noreply@sportshop.com.bd','secret://notif/email',true
    WHERE NOT EXISTS (SELECT 1 FROM "channel_provider_config" WHERE "channel"='email')
  `);

  for (const t of TEMPLATES) {
    await ds.query(
      `INSERT INTO "notification_templates" ("id","event_type","channel","locale","subject","body","version","is_active")
       SELECT gen_random_uuid(),$1::varchar,$2::varchar,$3::varchar,$4::varchar,$5::text,1,true
       WHERE NOT EXISTS (
         SELECT 1 FROM "notification_templates" WHERE "event_type"=$1 AND "channel"=$2 AND "locale"=$3 AND "is_active"=true
       )`,
      [t.event, t.channel, t.locale, t.subject, t.body],
    );
  }

  const count = await ds.query(`SELECT count(*)::int AS n FROM "notification_templates"`);
  console.log(`Seed complete. notification_templates rows: ${count[0].n}`);
  await ds.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
