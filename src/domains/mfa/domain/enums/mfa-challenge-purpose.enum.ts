/** What an MFA OTP challenge is for (SRS §8; login gate vs. enrollment confirmation). */
export enum MfaChallengePurpose {
  /** Second factor during an email+password login (FR-MFA-010). */
  LOGIN_2FA = 'login_2fa',
  /** Confirming the channel works while enabling 2FA (FR-MFA-001). */
  ENABLE = 'enable',
  /** Fresh proof-of-control code required to disable 2FA from a non-2FA-verified session (FR-MFA-002). */
  DISABLE = 'disable',
}
