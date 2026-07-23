import { ConfigService } from '@nestjs/config';

import { requireEnv } from './require-env';

/**
 * AUTH hardening test-track (auth-hardening-test AC1, session-security AC1):
 * security-critical secrets fail FAST at bootstrap — no hardcoded fallback string
 * is ever reachable when `JWT_ACCESS_SECRET` (or any required var) is unset.
 */
describe('Shared — requireEnv (JWT fail-fast, FR-AUTH session-security)', () => {
  const configWith = (value: string | undefined) =>
    ({ get: jest.fn().mockReturnValue(value) }) as unknown as ConfigService;

  it('returns the value when the variable is set', () => {
    expect(requireEnv(configWith('super-secret'), 'JWT_ACCESS_SECRET')).toBe('super-secret');
  });

  it('throws when the variable is missing — bootstrap fails, no fallback (AC1)', () => {
    expect(() => requireEnv(configWith(undefined), 'JWT_ACCESS_SECRET')).toThrow(
      /Missing required environment variable JWT_ACCESS_SECRET/,
    );
  });

  it('throws when the variable is blank (whitespace is not a secret)', () => {
    expect(() => requireEnv(configWith('   '), 'JWT_ACCESS_SECRET')).toThrow(
      /Missing required environment variable/,
    );
  });
});
