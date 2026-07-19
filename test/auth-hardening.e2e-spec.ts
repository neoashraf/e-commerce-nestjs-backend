import { applyE2eEnv, AUTH_TABLES, RecordingDispatcher } from './support/e2e-env';

applyE2eEnv(); // BEFORE AppModule import — ConfigService must see the test env.

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import * as request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { NOTIFICATION_DISPATCHER } from '../src/domains/auth/application/ports/notification-dispatcher.port';
import { AllExceptionsFilter } from '../src/shared/filters/all-exceptions.filter';

/**
 * AUTH Phase B hardening e2e (auth-hardening-test AC2–AC5) against the real app +
 * `e_commerce_test` DB. Freshness window at its default (600s), so a session that
 * just OTP-verified takes the `otp_required:false` fast path (FR-AUTH-037); the
 * OTP variant lives in auth-hardening-otp-variant.e2e-spec.ts (window=0).
 */
describe('AUTH hardening (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  const notif = new RecordingDispatcher();

  const P1 = '+8801711000001'; // registration → fast-path set → email attach → email login
  const P2 = '+8801711000002'; // passwordless guards + OTP purpose binding
  const P3 = '+8801711000003'; // BR-AUTH-5 revocation matrix via change-password
  const P4 = '+8801711000004'; // conflicting account for EMAIL_IN_USE

  /** Full phone-OTP login: request → captured code → verify. Returns the session. */
  async function otpLogin(phone: string, fullName?: string) {
    const req = await request(http).post('/api/v1/auth/otp/request').send({ phone }).expect(200);
    const code = notif.otpByPhone.get(phone) as string;
    const verify = await request(http)
      .post('/api/v1/auth/otp/verify')
      .send({ challenge_id: req.body.data.challenge_id, code, ...(fullName ? { full_name: fullName } : {}) })
      .expect(200);
    return verify.body.data as {
      customer: { id: string };
      tokens: { access_token: string; refresh_token: string };
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_DISPATCHER)
      .useValue(notif)
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = app.getHttpServer();

    const ds = app.get(DataSource);
    for (const t of AUTH_TABLES) await ds.query(`DELETE FROM "${t}"`);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  describe('registration + retirement surface (AC5)', () => {
    let access: string;

    it('registers a new phone account via OTP (envelope + tokens)', async () => {
      const session = await otpLogin(P1, 'E2E Customer One');
      expect(session.tokens.access_token).toBeTruthy();
      access = session.tokens.access_token;
    });

    it('GET /me exposes has_password=false and no is_lightweight (FR-AUTH-036; retirement)', async () => {
      const res = await request(http)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${access}`)
        .expect(200);
      expect(res.body.data.has_password).toBe(false);
      expect(res.body.data).not.toHaveProperty('is_lightweight');
    });

    it('the retired claim + internal lightweight routes are gone (404)', async () => {
      await request(http)
        .post('/api/v1/auth/account/claim')
        .send({ challenge_id: 'x', code: '000000' })
        .expect(404);
      await request(http)
        .post('/api/v1/internal/customers/lightweight')
        .send({ full_name: 'x', phone: P4 })
        .expect(404);
    });

    it('PATCH /me rejects an email field (amended contract 01, AC4)', async () => {
      await request(http)
        .patch('/api/v1/me')
        .set('Authorization', `Bearer ${access}`)
        .send({ email: 'sneaky@e2e.test' })
        .expect(400);
    });
  });

  describe('first-password set — freshness fast path (AC3, FR-AUTH-036/037)', () => {
    let access: string;
    let setToken: string;

    beforeAll(async () => {
      access = (await otpLogin(P1)).tokens.access_token;
    });

    it('set/request inside the freshness window returns otp_required:false + set_token', async () => {
      const res = await request(http)
        .post('/api/v1/me/password/set/request')
        .set('Authorization', `Bearer ${access}`)
        .send({})
        .expect(200);
      expect(res.body.data.otp_required).toBe(false);
      expect(res.body.data.set_token).toMatch(/^pst_/);
      setToken = res.body.data.set_token;
    });

    it('rejects a weak password with 400 WEAK_PASSWORD (FR-AUTH-030)', async () => {
      const res = await request(http)
        .post('/api/v1/me/password/set')
        .set('Authorization', `Bearer ${access}`)
        .send({ set_token: setToken, new_password: 'longpassword' })
        .expect(400);
      expect(res.body.error.code).toBe('WEAK_PASSWORD');
    });

    it('sets the password with the set_token; has_password flips; notification dispatched (AC4 of sibling)', async () => {
      await request(http)
        .post('/api/v1/me/password/set')
        .set('Authorization', `Bearer ${access}`)
        .send({ set_token: setToken, new_password: 'footy2026' })
        .expect(200);
      const me = await request(http).get('/api/v1/me').set('Authorization', `Bearer ${access}`).expect(200);
      expect(me.body.data.has_password).toBe(true);
      expect(notif.passwordEvents).toContain('password_set');
    });

    it('a second set/request now returns 409 PASSWORD_EXISTS', async () => {
      const res = await request(http)
        .post('/api/v1/me/password/set/request')
        .set('Authorization', `Bearer ${access}`)
        .send({})
        .expect(409);
      expect(res.body.error.code).toBe('PASSWORD_EXISTS');
    });
  });

  describe('email verify-before-attach (AC4, FR-AUTH-041/044/046)', () => {
    let access: string;
    let requestId: string;
    const NEW_EMAIL = 'customer-one@e2e.test';

    beforeAll(async () => {
      access = (await otpLogin(P1)).tokens.access_token;
    });

    it('request stores a pending change only — the account email stays unattached', async () => {
      const res = await request(http)
        .post('/api/v1/me/email/change/request')
        .set('Authorization', `Bearer ${access}`)
        .send({ new_email: NEW_EMAIL })
        .expect(200);
      expect(res.body.data.sent_to).toBe('c**@e2e.test');
      requestId = res.body.data.request_id;

      const me = await request(http).get('/api/v1/me').set('Authorization', `Bearer ${access}`).expect(200);
      expect(me.body.data.email).toBeNull(); // pending-only (FR-AUTH-041)
    });

    it('a wrong code is rejected with 400 and nothing attaches', async () => {
      await request(http)
        .post('/api/v1/me/email/change/confirm')
        .set('Authorization', `Bearer ${access}`)
        .send({ request_id: requestId, code: '000000' })
        .expect(400);
      const me = await request(http).get('/api/v1/me').set('Authorization', `Bearer ${access}`).expect(200);
      expect(me.body.data.email).toBeNull();
    });

    it('the captured code attaches the email already VERIFIED in one step', async () => {
      const code = notif.emailChangeByEmail.get(NEW_EMAIL) as string;
      const res = await request(http)
        .post('/api/v1/me/email/change/confirm')
        .set('Authorization', `Bearer ${access}`)
        .send({ request_id: requestId, code })
        .expect(200);
      expect(res.body.data).toEqual({ email: NEW_EMAIL, email_verified: true });
    });

    it('the customer can immediately log in with email + the set password (AC3)', async () => {
      const res = await request(http)
        .post('/api/v1/auth/login')
        .send({ email: NEW_EMAIL, password: 'footy2026' })
        .expect(200);
      expect(res.body.data.tokens.access_token).toBeTruthy();
    });

    it("another account requesting P1's address gets 409 at request time", async () => {
      const other = await otpLogin(P4, 'E2E Customer Four');
      const res = await request(http)
        .post('/api/v1/me/email/change/request')
        .set('Authorization', `Bearer ${other.tokens.access_token}`)
        .send({ new_email: NEW_EMAIL })
        .expect(409);
      expect(res.body.error.code).toBe('EMAIL_IN_USE');
    });
  });

  describe('passwordless guards + OTP purpose binding (AC2/AC3)', () => {
    it('PATCH /me/password on a passwordless account → 401 NO_PASSWORD_SET branch', async () => {
      const session = await otpLogin(P2, 'E2E Customer Two');
      const res = await request(http)
        .patch('/api/v1/me/password')
        .set('Authorization', `Bearer ${session.tokens.access_token}`)
        .send({ current_password: 'whatever1', new_password: 'newfooty2026' })
        .expect(401);
      expect(res.body.error.code).toBeDefined();
    });

    it('a password_reset-purpose code can never complete a login (BR-AUTH-3)', async () => {
      const req = await request(http)
        .post('/api/v1/auth/otp/request')
        .send({ phone: P2, purpose: 'password_reset' })
        .expect(200);
      const code = notif.otpByPhone.get(P2) as string;
      await request(http)
        .post('/api/v1/auth/otp/verify')
        .send({ challenge_id: req.body.data.challenge_id, code })
        .expect(400);
    });
  });

  describe('BR-AUTH-5 revocation matrix via change-password (AC2, FR-AUTH-038)', () => {
    it('change-password revokes every OTHER session; the current one survives', async () => {
      // Session A, then set a first password (fast path), then session B.
      const a = await otpLogin(P3, 'E2E Customer Three');
      const grant = await request(http)
        .post('/api/v1/me/password/set/request')
        .set('Authorization', `Bearer ${a.tokens.access_token}`)
        .send({})
        .expect(200);
      await request(http)
        .post('/api/v1/me/password/set')
        .set('Authorization', `Bearer ${a.tokens.access_token}`)
        .send({ set_token: grant.body.data.set_token, new_password: 'footy2026' })
        .expect(200);

      const b = await otpLogin(P3);

      // Change the password from B → A is revoked, B survives.
      await request(http)
        .patch('/api/v1/me/password')
        .set('Authorization', `Bearer ${b.tokens.access_token}`)
        .send({ current_password: 'footy2026', new_password: 'newfooty2026' })
        .expect(200);

      // Current session (B) survives — check it FIRST: presenting A's revoked token
      // triggers the FR-AUTH-016 reuse sweep, which torches every remaining session.
      await request(http)
        .post('/api/v1/auth/token/refresh')
        .send({ refresh_token: b.tokens.refresh_token })
        .expect(200);
      await request(http)
        .post('/api/v1/auth/token/refresh')
        .send({ refresh_token: a.tokens.refresh_token })
        .expect(401);
    });
  });
});
