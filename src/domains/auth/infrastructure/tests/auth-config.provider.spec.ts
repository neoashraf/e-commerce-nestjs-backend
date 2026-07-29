import { ConfigService } from '@nestjs/config';

import { resolveOtpDevReturn } from '../config/auth-config.provider';

/** Minimal ConfigService stand-in: `get(key)` reads from a plain map. */
function makeConfig(vars: Record<string, string>): ConfigService {
  return { get: (key: string): string | undefined => vars[key] } as unknown as ConfigService;
}

describe('Auth — resolveOtpDevReturn (DEV-ONLY OTP echo flag)', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('should be off when OTP_DEV_RETURN is unset', () => {
    process.env.NODE_ENV = 'development';
    expect(resolveOtpDevReturn(makeConfig({}))).toBe(false);
  });

  it('should be on outside production when OTP_DEV_RETURN=true', () => {
    process.env.NODE_ENV = 'development';
    expect(resolveOtpDevReturn(makeConfig({ OTP_DEV_RETURN: 'true' }))).toBe(true);
  });

  it('should stay off in production when only OTP_DEV_RETURN=true (fail-safe)', () => {
    process.env.NODE_ENV = 'production';
    expect(resolveOtpDevReturn(makeConfig({ OTP_DEV_RETURN: 'true' }))).toBe(false);
  });

  it('should be on in production when the escape hatch is also set', () => {
    process.env.NODE_ENV = 'production';
    const config = makeConfig({ OTP_DEV_RETURN: 'true', OTP_DEV_RETURN_ALLOW_PROD: 'true' });
    expect(resolveOtpDevReturn(config)).toBe(true);
  });

  it('should stay off in production when the escape hatch is set but OTP_DEV_RETURN is not', () => {
    process.env.NODE_ENV = 'production';
    expect(resolveOtpDevReturn(makeConfig({ OTP_DEV_RETURN_ALLOW_PROD: 'true' }))).toBe(false);
  });
});
