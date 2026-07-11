/** Platform-wide 2FA enforcement mode (SRS §4, FR-MFA-030). */
export enum MfaEnforcement {
  /** Each customer chooses whether to enable 2FA. */
  OPTIONAL = 'optional',
  /** Every email+password login requires a second factor. */
  MANDATORY = 'mandatory',
}
