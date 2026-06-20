import 'dotenv/config';
import { AppDataSource } from '../data-source';

/**
 * Idempotent seed for the NOTIF dispatch slice: placeholder ChannelProviderConfig (sms/email)
 * + transactional templates for the in-scope OTP/email events. Rerunning inserts nothing new.
 * Run: `npm run seed:notifications`
 */
const OTP_BODY_EN = 'Your SportShop verification code is {{code}}. It expires in {{ttl_minutes}} minutes.';
const OTP_BODY_BN = 'আপনার SportShop ভেরিফিকেশন কোড {{code}}। এটি {{ttl_minutes}} মিনিটে মেয়াদ শেষ হবে।';

/**
 * Branded, email-safe HTML shell for transactional emails. `{{placeholders}}` inside `inner`
 * are left intact for the dispatch renderer to substitute. Inline styles only (email clients
 * strip <style>/external CSS).
 */
function emailHtml(heading: string, inner: string): string {
  return [
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937">',
    `  <h2 style="margin:0 0 12px;color:#111827">${heading}</h2>`,
    inner,
    '  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">',
    '  <p style="font-size:12px;color:#9ca3af">SportShop · automated message, please do not reply.</p>',
    '</div>',
  ].join('\n');
}

/** A primary call-to-action button + a plain-link fallback (some clients block buttons). */
function emailButton(url: string, label: string): string {
  return [
    `  <p style="text-align:center;margin:28px 0"><a href="${url}" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;display:inline-block">${label}</a></p>`,
    `  <p style="font-size:13px;color:#6b7280">Or paste this link into your browser:<br><a href="${url}">${url}</a></p>`,
  ].join('\n');
}

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
  {
    event: 'auth.email_verify',
    channel: 'email',
    locale: 'en',
    subject: 'Verify your email',
    body: emailHtml(
      'Verify your email',
      '  <p>Hi {{name}},</p>\n  <p>Please confirm your email address to finish setting up your SportShop account.</p>\n' +
        emailButton('{{verify_url}}', 'Verify email'),
    ),
  },
  {
    event: 'auth.password_reset',
    channel: 'email',
    locale: 'en',
    subject: 'Reset your password',
    body: emailHtml(
      'Reset your password',
      "  <p>Hi {{name}},</p>\n  <p>We received a request to reset your password. Choose a new one below. If you did not request this, you can safely ignore this email.</p>\n" +
        emailButton('{{reset_url}}', 'Reset password'),
    ),
  },
  {
    event: 'admin.invite',
    channel: 'email',
    locale: 'en',
    subject: "You're invited to SportShop Admin",
    body: emailHtml(
      "You're invited to SportShop Admin",
      "  <p>Hi {{name}},</p>\n  <p>You've been invited to the SportShop admin panel. Set your password to activate your account.</p>\n" +
        emailButton('{{invite_url}}', 'Activate your account'),
    ),
  },
  {
    event: 'admin.password_reset',
    channel: 'email',
    locale: 'en',
    subject: 'Admin password reset',
    body: emailHtml(
      'Reset your admin password',
      "  <p>Hi {{name}},</p>\n  <p>We received a request to reset your admin password. Choose a new one below. If you did not request this, you can ignore this email.</p>\n" +
        emailButton('{{reset_url}}', 'Reset password'),
    ),
  },
  {
    event: 'admin.2fa',
    channel: 'email',
    locale: 'en',
    subject: 'Your admin 2FA code',
    body: emailHtml(
      'Your admin login code',
      '  <p>Use this verification code to finish signing in:</p>\n  <p style="text-align:center;font-size:28px;font-weight:700;letter-spacing:6px;margin:24px 0;color:#111827">{{code}}</p>\n  <p style="font-size:13px;color:#6b7280">If you did not try to sign in, please secure your account.</p>',
    ),
  },
  { event: 'admin.2fa', channel: 'sms', locale: 'en', subject: null, body: 'Your SportShop admin code is {{code}}.' },
  {
    event: 'lead.received_ack',
    channel: 'email',
    locale: 'en',
    subject: "We've received your enquiry ({{ticket_no}})",
    body: emailHtml(
      "We've received your enquiry",
      '  <p>Hi {{name}},</p>\n  <p>Thanks for contacting SportShop. We have received your enquiry — your reference is <strong>{{ticket_no}}</strong>. Our team will get back to you shortly.</p>',
    ),
  },
  {
    event: 'lead.reply',
    channel: 'email',
    locale: 'en',
    subject: 'Re: your enquiry {{ticket_no}}',
    body: emailHtml(
      'Reply to your enquiry {{ticket_no}}',
      '  <p>Hi {{name}},</p>\n  <p>Regarding your enquiry <strong>{{ticket_no}}</strong>:</p>\n  <div style="background:#f3f4f6;border-radius:6px;padding:14px 16px;margin:14px 0;white-space:pre-line">{{reply_body}}</div>\n  <p>— SportShop Support</p>',
    ),
  },
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
