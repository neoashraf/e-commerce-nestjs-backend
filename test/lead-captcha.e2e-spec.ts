import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { AppModule } from '../src/app.module';
import { CAPTCHA_VERIFIER } from '../src/domains/leads/ports/captcha-verifier.port';

/**
 * LG1 e2e — the CAPTCHA gate on POST /api/v1/leads (FR-LEAD-006).
 *
 * Requires a running Postgres (the full AppModule boots TypeORM). The captcha verifier is
 * overridden with a controllable fake so we exercise the accept/reject branches without calling
 * Cloudflare; the verifier's own pass/fail/timeout logic is unit-tested separately
 * (src/domains/leads/infrastructure/tests/turnstile-captcha.verifier.spec.ts).
 */
describe('LEAD captcha gate (e2e)', () => {
  let app: INestApplication;
  const verifier = { verify: jest.fn() };

  const validBody = {
    type: 'general',
    subject: 'Need help choosing boots',
    message: 'Which turf shoe fits a wide foot?',
    submitter_name: 'Test User',
    submitter_phone: '+8801712345678',
    submitter_email: 'test@example.com',
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CAPTCHA_VERIFIER)
      .useValue(verifier)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  afterEach(() => jest.clearAllMocks());

  it('rejects the submission with 400 CAPTCHA_FAILED when the token is rejected', async () => {
    verifier.verify.mockResolvedValue(false);
    const res = await request(app.getHttpServer())
      .post('/api/v1/leads')
      .send({ ...validBody, captcha_token: 'bad-token' })
      .expect(400);
    expect(res.body.error.code).toBe('CAPTCHA_FAILED');
  });

  it('accepts the submission (201) and returns a reference when the token is accepted', async () => {
    verifier.verify.mockResolvedValue(true);
    const res = await request(app.getHttpServer())
      .post('/api/v1/leads')
      .send({ ...validBody, captcha_token: 'good-token' })
      .expect(201);
    expect(res.body.data).toHaveProperty('reference');
  });
});
