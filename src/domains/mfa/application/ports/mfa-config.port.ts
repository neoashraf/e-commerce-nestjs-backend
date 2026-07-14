/**
 * Runtime MFA tunables not stored on the policy row (SRS §14). The per-challenge TTL, resend
 * cooldown, and attempt cap live on the admin-editable `MfaSettings` row; these two are env-only.
 */
export interface MfaConfig {
  /** Max second-factor challenges issued per customer per rolling hour (FR-MFA-040). */
  resendHourlyCap: number;
  /** Pre-auth (login-continuation) token lifetime in seconds (BR-MFA-5). */
  preAuthTtlSeconds: number;
}

export const MFA_CONFIG = Symbol('MFA_CONFIG');
