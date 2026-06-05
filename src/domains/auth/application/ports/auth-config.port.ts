/** Tunable auth values, sourced from env (brief: JWT_*_TTL, OTP_*, LOGIN_*, EMAIL_VERIFY_TTL). */
export interface AuthConfig {
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  otpTtlSeconds: number;
  otpResendCooldownSeconds: number;
  otpHourlyCap: number;
  otpAttemptCap: number;
  /** Consecutive email/password failures before a temporary lockout (FR-AUTH-012). */
  loginMaxAttempts: number;
  /** Lockout duration in minutes (FR-AUTH-012). */
  loginLockoutMinutes: number;
  /** Email-verification link lifetime in seconds (FR-AUTH-043). */
  emailVerifyTtlSeconds: number;
  /** Cooldown between verification-email resends, in seconds (AC4). */
  emailVerifyResendCooldownSeconds: number;
}

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');
