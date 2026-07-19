import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AUTH_CONFIG, AuthConfig } from '../../application/ports/auth-config.port';

/** Parse a duration like `15m`, `30d`, `300s`, or a bare number, to seconds. */
export function parseDurationToSeconds(input: string | undefined, fallback: number): number {
  if (!input) return fallback;
  const match = /^(\d+)\s*(s|m|h|d)?$/.exec(input.trim());
  if (!match) {
    const asNumber = Number(input);
    return Number.isFinite(asNumber) ? asNumber : fallback;
  }
  const value = Number(match[1]);
  const unit = match[2] ?? 's';
  const multiplier = unit === 'd' ? 86400 : unit === 'h' ? 3600 : unit === 'm' ? 60 : 1;
  return value * multiplier;
}

export const authConfigProvider: Provider = {
  provide: AUTH_CONFIG,
  inject: [ConfigService],
  useFactory: (config: ConfigService): AuthConfig => ({
    accessTtlSeconds: parseDurationToSeconds(config.get<string>('JWT_ACCESS_TTL'), 900),
    refreshTtlSeconds: parseDurationToSeconds(config.get<string>('JWT_REFRESH_TTL'), 2_592_000),
    otpTtlSeconds: Number(config.get<string>('OTP_TTL_SECONDS') ?? 300),
    otpResendCooldownSeconds: Number(config.get<string>('OTP_RESEND_COOLDOWN') ?? 60),
    otpHourlyCap: Number(config.get<string>('OTP_HOURLY_CAP') ?? 5),
    otpAttemptCap: Number(config.get<string>('OTP_ATTEMPT_CAP') ?? 5),
    loginMaxAttempts: Number(config.get<string>('LOGIN_MAX_ATTEMPTS') ?? 5),
    loginLockoutMinutes: Number(config.get<string>('LOGIN_LOCKOUT_MINUTES') ?? 15),
    emailVerifyTtlSeconds: parseDurationToSeconds(config.get<string>('EMAIL_VERIFY_TTL'), 86_400),
    emailVerifyResendCooldownSeconds: Number(
      config.get<string>('EMAIL_VERIFY_RESEND_COOLDOWN') ?? 60,
    ),
    passwordResetTtlSeconds: parseDurationToSeconds(config.get<string>('PASSWORD_RESET_TTL'), 1_800),
    passwordSetFreshnessSeconds: parseDurationToSeconds(
      config.get<string>('PASSWORD_SET_FRESHNESS_WINDOW'),
      600,
    ),
    passwordSetTokenTtlSeconds: parseDurationToSeconds(
      config.get<string>('PASSWORD_SET_TOKEN_TTL'),
      600,
    ),
    emailChangeTtlSeconds: parseDurationToSeconds(config.get<string>('EMAIL_CHANGE_TTL'), 900),
    emailChangeResendCooldownSeconds: Number(
      config.get<string>('EMAIL_CHANGE_RESEND_COOLDOWN') ?? 60,
    ),
    // DEV-ONLY OTP echo (no SMS gateway yet). Enabled ONLY when OTP_DEV_RETURN=true AND not in
    // production — the NODE_ENV check is a hard fail-safe so an accidental prod env var can never
    // expose the code (which would let anyone "verify" any phone → account takeover).
    otpDevReturn:
      process.env.NODE_ENV !== 'production' &&
      (config.get<string>('OTP_DEV_RETURN') ?? '').toLowerCase() === 'true',
  }),
};
