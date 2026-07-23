import { applyE2eEnv, AUTH_TABLES, RecordingDispatcher } from './support/e2e-env';

// Cooldown 0 comes from the policy ROW (inserted below); the hourly cap is env-driven —
// set high here so sequential flows never trip it (the 429 throttle test uses its own
// dedicated customer and counts against the same cap, so it asserts the cap boundary
// by flooding well past its OWN challenge budget).
applyE2eEnv({ MFA_RESEND_HOURLY_CAP: '6' });

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { NOTIFICATION_DISPATCHER } from '../src/domains/auth/application/ports/notification-dispatcher.port';
import { AllExceptionsFilter } from '../src/shared/filters/all-exceptions.filter';

const MFA_TABLES = ['mfa_pre_auth', 'mfa_challenges', 'customer_mfa', 'mfa_settings'];

/** Decode a JWT payload without verifying (assertion helper only). */
const claims = (jwt: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());

/**
 * MFA hardening e2e (mfa-hardening-test AC1–AC5) against the real app +
 * `e_commerce_test` DB: the FR-MFA-018 session flag across login doors, the
 * FR-MFA-002 disable matrix, FR-MFA-007 revocation+notify, FR-MFA-008 enrollment
 * throttling, and FR-MFA-012/036 default_channel routing. Admin PUT validation of
 * default_channel is unit-covered (MfaSettings entity) — the routing effect is
 * asserted here by updating the policy row directly.
 */
describe('MFA hardening (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let ds: DataSource;
  const notif = new RecordingDispatcher();

  /** OTP login; returns tokens. */
  async function otpLogin(phone: string, fullName?: string) {
    const rq = await request(http).post('/api/v1/auth/otp/request').send({ phone }).expect(200);
    const code = notif.otpByPhone.get(phone) as string;
    const res = await request(http)
      .post('/api/v1/auth/otp/verify')
      .send({ challenge_id: rq.body.data.challenge_id, code, ...(fullName ? { full_name: fullName } : {}) })
      .expect(200);
    return res.body.data.tokens as { access_token: string; refresh_token: string };
  }

  /** Full account bootstrap: OTP register → set password (freshness) → attach verified email. */
  async function fullAccount(phone: string, email: string, name: string) {
    const tokens = await otpLogin(phone, name);
    const grant = await request(http)
      .post('/api/v1/me/password/set/request')
      .set('Authorization', `Bearer ${tokens.access_token}`)
      .send({})
      .expect(200);
    await request(http)
      .post('/api/v1/me/password/set')
      .set('Authorization', `Bearer ${tokens.access_token}`)
      .send({ set_token: grant.body.data.set_token, new_password: 'footy2026' })
      .expect(200);
    const ecr = await request(http)
      .post('/api/v1/me/email/change/request')
      .set('Authorization', `Bearer ${tokens.access_token}`)
      .send({ new_email: email })
      .expect(200);
    await request(http)
      .post('/api/v1/me/email/change/confirm')
      .set('Authorization', `Bearer ${tokens.access_token}`)
      .send({ request_id: ecr.body.data.request_id, code: notif.emailChangeByEmail.get(email) })
      .expect(200);
    return tokens;
  }

  /** Enable 2FA from the given session (email channel) and confirm it. */
  async function enable2fa(access: string, email: string) {
    const en = await request(http)
      .post('/api/v1/me/mfa/enable')
      .set('Authorization', `Bearer ${access}`)
      .send({ preferred_channel: 'email' })
      .expect(200);
    await request(http)
      .post('/api/v1/me/mfa/enable/confirm')
      .set('Authorization', `Bearer ${access}`)
      .send({
        challenge_id: en.body.data.verification.challenge_id,
        code: notif.mfaCodeByTarget.get(email),
      })
      .expect(200);
  }

  /** Email+password login for a 2FA-enabled account → completed second factor. */
  async function mfaLogin(email: string) {
    const login = await request(http)
      .post('/api/v1/auth/login')
      .send({ email, password: 'footy2026' })
      .expect(200);
    expect(login.body.data.mfa_required).toBe(true);
    const verify = await request(http)
      .post('/api/v1/auth/mfa/verify')
      .send({ pre_auth_token: login.body.data.pre_auth_token, code: notif.mfaCodeByTarget.get(email) })
      .expect(200);
    return verify.body.data.tokens as { access_token: string; refresh_token: string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_DISPATCHER)
      .useValue(notif)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = app.getHttpServer();

    ds = app.get(DataSource);
    for (const t of [...MFA_TABLES, ...AUTH_TABLES]) await ds.query(`DELETE FROM "${t}"`);
    // Policy row: both channels on, optional, cooldown 0 (sequential flows don't sleep).
    await ds.query(`
      INSERT INTO "mfa_settings"
        ("id","sms_enabled","email_enabled","enforcement_mode","default_channel",
         "otp_ttl_seconds","resend_cooldown_seconds","max_attempts")
      VALUES (gen_random_uuid(), true, true, 'optional', 'email', 300, 0, 5)
    `);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  describe('session flag matrix (AC1, FR-MFA-018)', () => {
    const PHONE = '+8801722000001';
    const EMAIL = 'mfa-one@e2e.test';

    it('phone-OTP and plain password sessions carry mfa=false; the 2FA-verified session carries mfa=true', async () => {
      const otpTokens = await fullAccount(PHONE, EMAIL, 'MFA One');
      expect(claims(otpTokens.access_token).mfa).toBeUndefined(); // OTP door: not 2FA-verified

      // 2FA still off → email login issues tokens directly, mfa=false.
      const plain = await request(http)
        .post('/api/v1/auth/login')
        .send({ email: EMAIL, password: 'footy2026' })
        .expect(200);
      expect(plain.body.data.mfa_required).toBeUndefined();
      expect(claims(plain.body.data.tokens.access_token).mfa).toBeUndefined();

      await enable2fa(plain.body.data.tokens.access_token, EMAIL);
      const mfaTokens = await mfaLogin(EMAIL);
      expect(claims(mfaTokens.access_token).mfa).toBe(true);

      const rows = await ds.query(
        `SELECT s.mfa_verified FROM sessions s JOIN customers c ON c.id = s.customer_id
         WHERE c.phone = $1 AND s.revoked_at IS NULL ORDER BY s.created_at DESC LIMIT 1`,
        [PHONE],
      );
      expect(rows[0].mfa_verified).toBe(true); // row flag matches the claim
    }, 60_000);
  });

  describe('disable matrix + revocation (AC2/AC3, FR-MFA-002/007)', () => {
    const PHONE = '+8801722000002';
    const EMAIL = 'mfa-two@e2e.test';

    beforeAll(async () => {
      const tokens = await fullAccount(PHONE, EMAIL, 'MFA Two');
      await enable2fa(tokens.access_token, EMAIL);
    }, 60_000);

    it('enable-confirm revoked the other sessions and notified (AC3)', async () => {
      expect(notif.mfaStateChanges).toContain(`email:${EMAIL}:true`);
    });

    it('a 2FA-verified session disables password-only; other sessions revoked, current survives', async () => {
      const other = await mfaLogin(EMAIL); // session to be revoked
      const acting = await mfaLogin(EMAIL);

      await request(http)
        .post('/api/v1/me/mfa/disable')
        .set('Authorization', `Bearer ${acting.access_token}`)
        .send({ current_password: 'footy2026' })
        .expect(200);

      expect(notif.mfaStateChanges).toContain(`email:${EMAIL}:false`);
      // Current first — a revoked token triggers the FR-AUTH-016 reuse sweep.
      await request(http)
        .post('/api/v1/auth/token/refresh')
        .send({ refresh_token: acting.refresh_token })
        .expect(200);
      await request(http)
        .post('/api/v1/auth/token/refresh')
        .send({ refresh_token: other.refresh_token })
        .expect(401);
    }, 60_000);

    it('a NON-2FA-verified session without a code gets 400 MFA_CODE_REQUIRED (a code is sent); with the code it disables (AC2)', async () => {
      // Re-enable from a fresh plain-password session (2FA currently off).
      const plain = await request(http)
        .post('/api/v1/auth/login')
        .send({ email: EMAIL, password: 'footy2026' })
        .expect(200);
      const access = plain.body.data.tokens.access_token as string;
      await enable2fa(access, EMAIL);

      // This session did NOT pass the 2FA step → code demanded.
      notif.mfaCodeByTarget.delete(EMAIL);
      const missing = await request(http)
        .post('/api/v1/me/mfa/disable')
        .set('Authorization', `Bearer ${access}`)
        .send({ current_password: 'footy2026' })
        .expect(400);
      expect(missing.body.error.code).toBe('MFA_CODE_REQUIRED');
      expect(notif.mfaCodeByTarget.get(EMAIL)).toBeTruthy(); // fresh disable code dispatched

      const wrong = await request(http)
        .post('/api/v1/me/mfa/disable')
        .set('Authorization', `Bearer ${access}`)
        .send({ current_password: 'footy2026', code: '000000' })
        .expect(400);
      expect(wrong.body.error.code).toBe('INVALID_CODE');

      await request(http)
        .post('/api/v1/me/mfa/disable')
        .set('Authorization', `Bearer ${access}`)
        .send({ current_password: 'footy2026', code: notif.mfaCodeByTarget.get(EMAIL) })
        .expect(200);
    }, 60_000);
  });

  describe('enrollment throttling (AC4, FR-MFA-008)', () => {
    const PHONE = '+8801722000003';
    const EMAIL = 'mfa-three@e2e.test';

    it('flooding enable trips the hourly cap with 429 and codes stop dispatching', async () => {
      const tokens = await fullAccount(PHONE, EMAIL, 'MFA Three');
      // Bootstrap consumed 0 MFA challenges; cap is 6 per hour per customer.
      for (let i = 0; i < 6; i += 1) {
        await request(http)
          .post('/api/v1/me/mfa/enable')
          .set('Authorization', `Bearer ${tokens.access_token}`)
          .send({ preferred_channel: 'email' })
          .expect(200);
      }
      notif.mfaCodeByTarget.delete(EMAIL);
      const blocked = await request(http)
        .post('/api/v1/me/mfa/enable')
        .set('Authorization', `Bearer ${tokens.access_token}`)
        .send({ preferred_channel: 'email' })
        .expect(429);
      expect(blocked.body.error.code).toBe('MFA_HOURLY_CAP');
      expect(notif.mfaCodeByTarget.get(EMAIL)).toBeUndefined(); // dispatch stopped
    }, 60_000);
  });

  describe('default_channel resolution (AC5, FR-MFA-012/036)', () => {
    const PHONE = '+8801722000004';
    const EMAIL = 'mfa-four@e2e.test';

    it('both-eligible + no preference → first login code routes to the policy default_channel; a saved preference outranks it', async () => {
      const tokens = await fullAccount(PHONE, EMAIL, 'MFA Four'); // phone + email both verified
      await enable2fa(tokens.access_token, EMAIL);
      // Clear the saved preference so the policy default decides (FR-MFA-012).
      await ds.query(
        `UPDATE customer_mfa SET preferred_channel = NULL
         WHERE customer_id = (SELECT id FROM customers WHERE phone = $1)`,
        [PHONE],
      );
      await ds.query(`UPDATE mfa_settings SET default_channel = 'sms'`);

      notif.mfaCodeByTarget.delete(PHONE);
      notif.mfaCodeByTarget.delete(EMAIL);
      const login = await request(http)
        .post('/api/v1/auth/login')
        .send({ email: EMAIL, password: 'footy2026' })
        .expect(200);
      expect(login.body.data.challenge.channel).toBe('sms'); // default_channel routed
      expect(notif.mfaCodeByTarget.get(PHONE)).toBeTruthy();

      // Saved preference outranks the default (FR-MFA-012).
      await ds.query(
        `UPDATE customer_mfa SET preferred_channel = 'email'
         WHERE customer_id = (SELECT id FROM customers WHERE phone = $1)`,
        [PHONE],
      );
      const login2 = await request(http)
        .post('/api/v1/auth/login')
        .send({ email: EMAIL, password: 'footy2026' })
        .expect(200);
      expect(login2.body.data.challenge.channel).toBe('email');
    }, 60_000);
  });
});
