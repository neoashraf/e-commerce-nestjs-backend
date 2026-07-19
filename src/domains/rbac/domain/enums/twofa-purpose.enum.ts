/** What an admin 2FA challenge proves (FR-RBAC-002/008/009) — purpose-bound like OTPs. */
export enum TwofaPurpose {
  /** Second step of an admin login (FR-RBAC-002). */
  LOGIN = 'login',
  /** Proving the email channel works before 2FA activates (FR-RBAC-008). */
  ENABLE = 'enable',
  /** Fresh proof-of-control to disable 2FA from a non-2FA-verified session (FR-RBAC-009). */
  DISABLE = 'disable',
}
