import { ConfigService } from '@nestjs/config';

import { TurnstileCaptchaVerifier } from '../turnstile-captcha.verifier';

/** A minimal ConfigService stub backed by a plain map (honours the `get(key, default)` shape). */
function configStub(values: Record<string, string>): ConfigService {
  return {
    get: (key: string, def?: string) => values[key] ?? def,
  } as unknown as ConfigService;
}

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response;
}

describe('LEAD — TurnstileCaptchaVerifier', () => {
  const ENABLED = { LEAD_CAPTCHA_ENABLED: 'true', TURNSTILE_SECRET_KEY: 'sk_test' };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => jest.clearAllMocks());

  it('bypasses (returns true) without calling siteverify when disabled', async () => {
    const verifier = new TurnstileCaptchaVerifier(configStub({ LEAD_CAPTCHA_ENABLED: 'false' }));
    await expect(verifier.verify('anything')).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes when Turnstile returns success:true', async () => {
    fetchMock.mockResolvedValue(okResponse({ success: true }));
    const verifier = new TurnstileCaptchaVerifier(configStub(ENABLED));
    await expect(verifier.verify('good-token')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects when Turnstile returns success:false', async () => {
    fetchMock.mockResolvedValue(okResponse({ success: false, 'error-codes': ['invalid-input-response'] }));
    const verifier = new TurnstileCaptchaVerifier(configStub(ENABLED));
    await expect(verifier.verify('bad-token')).resolves.toBe(false);
  });

  it('rejects a missing/empty token without calling siteverify (enabled)', async () => {
    const verifier = new TurnstileCaptchaVerifier(configStub(ENABLED));
    await expect(verifier.verify(null)).resolves.toBe(false);
    await expect(verifier.verify('   ')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects (fail-closed) when no secret is configured', async () => {
    const verifier = new TurnstileCaptchaVerifier(configStub({ LEAD_CAPTCHA_ENABLED: 'true' }));
    await expect(verifier.verify('good-token')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed (returns false, no throw) on a network error / timeout', async () => {
    fetchMock.mockRejectedValue(new Error('aborted'));
    const verifier = new TurnstileCaptchaVerifier(configStub(ENABLED));
    await expect(verifier.verify('good-token')).resolves.toBe(false);
  });

  it('fails closed on a non-2xx siteverify response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: () => Promise.resolve({}) } as unknown as Response);
    const verifier = new TurnstileCaptchaVerifier(configStub(ENABLED));
    await expect(verifier.verify('good-token')).resolves.toBe(false);
  });
});
