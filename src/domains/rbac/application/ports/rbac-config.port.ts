/** Tunable RBAC auth values, sourced from env (brief env vars; SRS §11/§14 defaults). */
export interface RbacConfig {
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  refreshTtlRememberSeconds: number;
  loginLockThreshold: number;
  loginLockMinutes: number;
  twofaOtpTtlSeconds: number;
  twofaAttemptCap: number;
  /** Cooldown between 2FA code sends, in seconds (FR-RBAC-008 throttling). */
  twofaResendCooldownSeconds: number;
  /** Max 2FA codes per admin per hour (FR-RBAC-008 throttling). */
  twofaHourlyCap: number;
  resetTokenTtlSeconds: number;
  /** Base URL of the admin panel (for building reset links). */
  adminPanelUrl: string;
}

export const RBAC_CONFIG = Symbol('RBAC_CONFIG');
