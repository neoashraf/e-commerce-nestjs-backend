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
  /** Password-reset link lifetime in seconds (FR-AUTH-033, default 30 min). */
  passwordResetTtlSeconds: number;
  /**
   * DEV-ONLY: echo the generated OTP back in the request-OTP response so a tester can read it on
   * screen while there's no live SMS gateway. Hard-gated OFF in production regardless of env
   * (see auth-config.provider) — returning the code in prod would bypass phone verification entirely.
   */
  otpDevReturn: boolean;
}

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');
