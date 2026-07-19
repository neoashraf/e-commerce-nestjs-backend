import { applyE2eEnv } from './support/e2e-env';

// Cooldown 0 so sequential flows don't sleep; hourly cap 5 — the throttle test uses a
// dedicated admin and floods past its own budget.
applyE2eEnv({ ADMIN_2FA_RESEND_COOLDOWN: '0', ADMIN_2FA_HOURLY_CAP: '5' });

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { ADMIN_NOTIFICATION_DISPATCHER } from '../src/domains/rbac/application/ports/admin-notification.port';
import { AllExceptionsFilter } from '../src/shared/filters/all-exceptions.filter';

/** Captures admin 2FA codes + state-change notices (stands in for NOTIF). */
class AdminNotifRecorder {
  codeByEmail = new Map<string, string>();
  stateChanges: string[] = [];
  async dispatchTwofaCode(i: { email: string; code: string }): Promise<void> {
    this.codeByEmail.set(i.email, i.code);
  }
  async dispatchAdminInvite(): Promise<void> {}
  async dispatchPasswordReset(): Promise<void> {}
  async dispatchTwofaStateChange(i: { email: string; enabled: boolean }): Promise<void> {
    this.stateChanges.push(`${i.email}:${i.enabled}`);
  }
}

// bcrypt(10) of 'Sup3r-Secret-Pass' — pre-generated so the suite doesn't depend on
// bcrypt timing at boot.
const HASH = '$2b$10$fAZrKkCcySBZGeR.Kazfa.clX./YXVOmrfMieyHImQsihHIIeaa/a';
const PASSWORD = 'Sup3r-Secret-Pass';
const EMAIL = 'admin-2fa@e2e.test';
const FLOOD_EMAIL = 'admin-flood@e2e.test';

/**
 * Admin 2FA enable→confirm e2e (rbac-admin-2fa-confirm-test AC1–AC5) against the
 * real app + `e_commerce_test` DB. The single admin is a SUPER ADMIN on purpose:
 * every flow passing proves AC5 parity (enable AND disable, no locked-on state).
 */
describe('RBAC admin 2FA (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let ds: DataSource;
  const notif = new AdminNotifRecorder();

  const login = async (email = EMAIL) => {
    const res = await request(http)
      .post('/api/v1/admin/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.data as {
      twofa_required?: boolean;
      challenge_id?: string;
      channel?: string;
      tokens?: { access_token: string; refresh_token: string };
    };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ADMIN_NOTIFICATION_DISPATCHER)
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

    for (const t of ['audit_entries', 'admin_twofa_challenges', 'admin_sessions', 'admin_users']) {
      await ds.query(`DELETE FROM "${t}"`);
    }
    await ds.query(
      `INSERT INTO roles (id, name, is_system) VALUES (gen_random_uuid(), 'Super Admin', true)
       ON CONFLICT DO NOTHING`,
    );
    await ds.query(
      `INSERT INTO admin_users (id, full_name, email, password_hash, role_id, twofa_enabled, status)
       SELECT gen_random_uuid(), 'E2E Super', $1, $2, r.id, false, 'active' FROM roles r WHERE r.name = 'Super Admin' LIMIT 1`,
      [EMAIL, HASH],
    );
    await ds.query(
      `INSERT INTO admin_users (id, full_name, email, password_hash, role_id, twofa_enabled, status)
       SELECT gen_random_uuid(), 'E2E Flood', $1, $2, r.id, false, 'active' FROM roles r WHERE r.name = 'Super Admin' LIMIT 1`,
      [FLOOD_EMAIL, HASH],
    );
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  describe('enable is two-step, email-only (AC1/AC2/AC4, FR-RBAC-008)', () => {
    let otherSession: { access_token: string; refresh_token: string };
    let acting: { access_token: string; refresh_token: string };
    let challengeId: string;

    it('a wrong password is rejected with 401 before any code is sent', async () => {
      otherSession = (await login()).tokens as typeof otherSession; // session to be revoked later
      acting = (await login()).tokens as typeof acting;
      await request(http)
        .patch('/api/v1/admin/me/2fa')
        .set('Authorization', `Bearer ${acting.access_token}`)
        .send({ enabled: true, current_password: 'wrong-password' })
        .expect(401);
    });

    it('any channel input is rejected — email-only (AC2, FR-RBAC-002)', async () => {
      await request(http)
        .patch('/api/v1/admin/me/2fa')
        .set('Authorization', `Bearer ${acting.access_token}`)
        .send({ enabled: true, current_password: PASSWORD, channel: 'sms' })
        .expect(400);
    });

    it('the password step emails a code — 2FA is NOT active yet (AC1)', async () => {
      const res = await request(http)
        .patch('/api/v1/admin/me/2fa')
        .set('Authorization', `Bearer ${acting.access_token}`)
        .send({ enabled: true, current_password: PASSWORD })
        .expect(200);
      expect(res.body.data.two_fa_enabled).toBe(false);
      expect(res.body.data.verification.sent_to).toBe('a**@e2e.test');
      challengeId = res.body.data.verification.challenge_id;
      expect(notif.codeByEmail.get(EMAIL)).toBeTruthy();

      const me = await request(http)
        .get('/api/v1/admin/me')
        .set('Authorization', `Bearer ${acting.access_token}`)
        .expect(200);
      expect(me.body.data.two_fa_enabled).toBe(false);
      expect(me.body.data).not.toHaveProperty('two_fa_channel');
    });

    it('an enable code can never complete a LOGIN (purpose binding)', async () => {
      await request(http)
        .post('/api/v1/admin/auth/2fa/verify')
        .send({ challenge_id: challengeId, code: notif.codeByEmail.get(EMAIL) })
        .expect(400);
    });

    it('a wrong confirm code is 400; the right one activates, revokes others, notifies, audits (AC1/AC4)', async () => {
      await request(http)
        .post('/api/v1/admin/me/2fa/confirm')
        .set('Authorization', `Bearer ${acting.access_token}`)
        .send({ challenge_id: challengeId, code: '000000' })
        .expect(400);

      const ok = await request(http)
        .post('/api/v1/admin/me/2fa/confirm')
        .set('Authorization', `Bearer ${acting.access_token}`)
        .send({ challenge_id: challengeId, code: notif.codeByEmail.get(EMAIL) })
        .expect(200);
      expect(ok.body.data.two_fa_enabled).toBe(true);
      expect(notif.stateChanges).toContain(`${EMAIL}:true`);

      // Current session survives (checked FIRST — a revoked token triggers the reuse sweep).
      await request(http)
        .post('/api/v1/admin/auth/token/refresh')
        .send({ refresh_token: acting.refresh_token })
        .expect(200);
      await request(http)
        .post('/api/v1/admin/auth/token/refresh')
        .send({ refresh_token: otherSession.refresh_token })
        .expect(401);

      const audit = await ds.query(
        `SELECT action, summary FROM audit_entries WHERE action = 'admin.2fa.enable'`,
      );
      expect(audit.length).toBeGreaterThan(0);
      expect(audit[0].summary).toMatchObject({ after: { two_fa_enabled: true } });
    }, 60_000);
  });

  describe('login challenge + disable matrix (AC3/AC5, FR-RBAC-002/009)', () => {
    it('login now runs the email challenge; the verified session exposes session_mfa_verified (FR-RBAC-002/018-mirror)', async () => {
      const start = await login();
      expect(start.twofa_required).toBe(true);
      expect(start.channel).toBe('email');

      const verify = await request(http)
        .post('/api/v1/admin/auth/2fa/verify')
        .send({ challenge_id: start.challenge_id, code: notif.codeByEmail.get(EMAIL) })
        .expect(200);
      const access = verify.body.data.tokens.access_token as string;

      const me = await request(http)
        .get('/api/v1/admin/me')
        .set('Authorization', `Bearer ${access}`)
        .expect(200);
      expect(me.body.data.session_mfa_verified).toBe(true);

      // AC3 branch 1 + AC5: the SUPER ADMIN 2FA-verified session disables password-only.
      const off = await request(http)
        .patch('/api/v1/admin/me/2fa')
        .set('Authorization', `Bearer ${access}`)
        .send({ enabled: false, current_password: PASSWORD })
        .expect(200);
      expect(off.body.data.two_fa_enabled).toBe(false);
      expect(off.body.data.verification).toBeUndefined();
      expect(notif.stateChanges).toContain(`${EMAIL}:false`);

      const audit = await ds.query(
        `SELECT action FROM audit_entries WHERE action = 'admin.2fa.disable'`,
      );
      expect(audit.length).toBeGreaterThan(0);
    }, 60_000);

    it('a NON-verified session must present a fresh code to disable (AC3)', async () => {
      // 2FA is off → login issues tokens directly; this session never passed the 2FA step.
      const plain = (await login()).tokens as { access_token: string };
      const me = await request(http)
        .get('/api/v1/admin/me')
        .set('Authorization', `Bearer ${plain.access_token}`)
        .expect(200);
      expect(me.body.data.session_mfa_verified).toBe(false);

      // Re-enable from this session (AC5: Super Admin enables like anyone).
      const en = await request(http)
        .patch('/api/v1/admin/me/2fa')
        .set('Authorization', `Bearer ${plain.access_token}`)
        .send({ enabled: true, current_password: PASSWORD })
        .expect(200);
      await request(http)
        .post('/api/v1/admin/me/2fa/confirm')
        .set('Authorization', `Bearer ${plain.access_token}`)
        .send({ challenge_id: en.body.data.verification.challenge_id, code: notif.codeByEmail.get(EMAIL) })
        .expect(200);

      // NOTE: confirm revoked other sessions but THIS one survives — still non-verified.
      const needCode = await request(http)
        .patch('/api/v1/admin/me/2fa')
        .set('Authorization', `Bearer ${plain.access_token}`)
        .send({ enabled: false, current_password: PASSWORD })
        .expect(200);
      expect(needCode.body.data.two_fa_enabled).toBe(true); // still ON — a code was emailed
      expect(needCode.body.data.verification.challenge_id).toBeTruthy();

      const done = await request(http)
        .patch('/api/v1/admin/me/2fa')
        .set('Authorization', `Bearer ${plain.access_token}`)
        .send({ enabled: false, current_password: PASSWORD, code: notif.codeByEmail.get(EMAIL) })
        .expect(200);
      expect(done.body.data.two_fa_enabled).toBe(false);
    }, 60_000);
  });

  describe('enrollment throttling (FR-RBAC-008 caps)', () => {
    it('flooding the enable step trips the hourly cap with 429 and codes stop dispatching', async () => {
      const tokens = (await login(FLOOD_EMAIL)).tokens as { access_token: string };
      for (let i = 0; i < 5; i += 1) {
        await request(http)
          .patch('/api/v1/admin/me/2fa')
          .set('Authorization', `Bearer ${tokens.access_token}`)
          .send({ enabled: true, current_password: PASSWORD })
          .expect(200);
      }
      notif.codeByEmail.delete(FLOOD_EMAIL);
      const blocked = await request(http)
        .patch('/api/v1/admin/me/2fa')
        .set('Authorization', `Bearer ${tokens.access_token}`)
        .send({ enabled: true, current_password: PASSWORD })
        .expect(429);
      expect(blocked.body.error.code).toBe('TWOFA_HOURLY_CAP');
      expect(notif.codeByEmail.get(FLOOD_EMAIL)).toBeUndefined();
    }, 60_000);
  });
});
