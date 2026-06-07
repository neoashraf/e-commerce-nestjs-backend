import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RBAC_CONFIG, RbacConfig } from '../../application/ports/rbac-config.port';

/** Parse a duration like `15m`, `90d`, `300s`, or a bare number, to seconds. */
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

export const rbacConfigProvider: Provider = {
  provide: RBAC_CONFIG,
  inject: [ConfigService],
  useFactory: (config: ConfigService): RbacConfig => ({
    accessTtlSeconds: parseDurationToSeconds(config.get<string>('ADMIN_JWT_ACCESS_TTL'), 900),
    refreshTtlSeconds: parseDurationToSeconds(config.get<string>('ADMIN_JWT_REFRESH_TTL'), 2_592_000),
    refreshTtlRememberSeconds: parseDurationToSeconds(
      config.get<string>('ADMIN_JWT_REFRESH_TTL_REMEMBER'),
      7_776_000,
    ),
    loginLockThreshold: Number(config.get<string>('ADMIN_LOGIN_LOCK_THRESHOLD') ?? 5),
    loginLockMinutes: Number(config.get<string>('ADMIN_LOGIN_LOCK_MINUTES') ?? 15),
    twofaOtpTtlSeconds: parseDurationToSeconds(config.get<string>('ADMIN_2FA_OTP_TTL'), 300),
    twofaAttemptCap: Number(config.get<string>('ADMIN_2FA_ATTEMPT_CAP') ?? 5),
    resetTokenTtlSeconds: parseDurationToSeconds(config.get<string>('ADMIN_RESET_TOKEN_TTL'), 3_600),
    adminPanelUrl: config.get<string>('ADMIN_PANEL_URL') ?? 'http://localhost:3000',
  }),
};
