/**
 * CUST enums (SRS 12 §8). The admin-side annotations/actions CUST owns; identity/status live in AUTH.
 */

/** A reversible account action recorded on a customer (SRS 12 §8 CustomerAccountAction.action). */
export enum CustomerAccountActionType {
  SUSPEND = 'suspend',
  REACTIVATE = 'reactivate',
}

/**
 * AUTH `Customer.status` values surfaced/acted on by CUST (read from AUTH; §5.1 filter, §5.3 actions).
 * `deleted` is anonymized — never actionable (FR-CUST-022, BR-CUST-5).
 */
export enum CustomerStatus {
  ACTIVE = 'active',
  LOCKED = 'locked',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}

/** Async export job lifecycle (FR-CUST-040, §12.7). */
export enum CustomerExportStatus {
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}
