/** Outcome recorded on an audit/security event (SRS 16 §8 AuditEntry.result). */
export enum AuditResult {
  SUCCESS = 'success',
  DENIED = 'denied',
  FAILED_LOGIN = 'failed_login',
}
