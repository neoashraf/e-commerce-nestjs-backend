import { applyE2eEnv, AUTH_TABLES, RecordingDispatcher } from './support/e2e-env';

// Freshness window forced to 0 so set/request ALWAYS takes the OTP variant
// (FR-AUTH-036) — the fast path is exercised in auth-hardening.e2e-spec.ts.
applyE2eEnv({ PASSWORD_SET_FRESHNESS_WINDOW: '0' });

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import * as request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { NOTIFICATION_DISPATCHER } from '../src/domains/auth/application/ports/notification-dispatcher.port';
import { AllExceptionsFilter } from '../src/shared/filters/all-exceptions.filter';

describe('AUTH hardening — set-password OTP variant (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  const notif = new RecordingDispatcher();

  const PHONE = '+8801711000011';

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

  it('outside the freshness window: request issues a password_set OTP to the OWN phone, set verifies it, other sessions revoked (AC3/AC4)', async () => {
    // Register (session A), then a second login (session B — the acting session).
    const login = async () => {
      const req = await request(http)
        .post('/api/v1/auth/otp/request')
        .send({ phone: PHONE })
        .expect(200);
      const code = notif.otpByPhone.get(PHONE) as string;
      const res = await request(http)
        .post('/api/v1/auth/otp/verify')
        .send({ challenge_id: req.body.data.challenge_id, code, full_name: 'OTP Variant' })
        .expect(200);
      return res.body.data.tokens as { access_token: string; refresh_token: string };
    };
    const a = await login();
    const b = await login();

    // Window=0 → the freshness waiver never applies: OTP variant (FR-AUTH-036).
    const grant = await request(http)
      .post('/api/v1/me/password/set/request')
      .set('Authorization', `Bearer ${b.access_token}`)
      .send({})
      .expect(200);
    expect(grant.body.data.otp_required).toBe(true);
    expect(grant.body.data.challenge_id).toBeTruthy();

    // A wrong code is rejected and nothing is stored.
    await request(http)
      .post('/api/v1/me/password/set')
      .set('Authorization', `Bearer ${b.access_token}`)
      .send({ challenge_id: grant.body.data.challenge_id, code: '000000', new_password: 'footy2026' })
      .expect(400);

    // The captured code (sent to the account's own phone) completes the set.
    const code = notif.otpByPhone.get(PHONE) as string;
    await request(http)
      .post('/api/v1/me/password/set')
      .set('Authorization', `Bearer ${b.access_token}`)
      .send({ challenge_id: grant.body.data.challenge_id, code, new_password: 'footy2026' })
      .expect(200);
    expect(notif.passwordEvents).toContain('password_set');

    // BR-AUTH-5: acting session B survives (checked FIRST — a revoked token triggers
    // the FR-AUTH-016 reuse sweep, torching every remaining session), A is revoked.
    await request(http)
      .post('/api/v1/auth/token/refresh')
      .send({ refresh_token: b.refresh_token })
      .expect(200);
    await request(http)
      .post('/api/v1/auth/token/refresh')
      .send({ refresh_token: a.refresh_token })
      .expect(401);
  }, 60_000);
});
