/** Tunable auth values, sourced from env (brief: JWT_*_TTL, OTP_*). */
export interface AuthConfig {
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  otpTtlSeconds: number;
  otpResendCooldownSeconds: number;
  otpHourlyCap: number;
  otpAttemptCap: number;
}

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');
