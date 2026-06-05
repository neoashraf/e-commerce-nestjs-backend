/** Tunable RBAC auth values, sourced from env (brief env vars; SRS §11/§14 defaults). */
export interface RbacConfig {
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  refreshTtlRememberSeconds: number;
  loginLockThreshold: number;
  loginLockMinutes: number;
  twofaOtpTtlSeconds: number;
  twofaAttemptCap: number;
  resetTokenTtlSeconds: number;
  /** Base URL of the admin panel (for building reset links). */
  adminPanelUrl: string;
}

export const RBAC_CONFIG = Symbol('RBAC_CONFIG');
