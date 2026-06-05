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
  }),
};
