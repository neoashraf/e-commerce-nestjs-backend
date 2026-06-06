export enum NotificationChannel {
  SMS = 'sms',
  EMAIL = 'email',
}

export enum NotificationCategory {
  TRANSACTIONAL = 'transactional',
  PROMOTIONAL = 'promotional',
}

export enum NotificationStatus {
  QUEUED = 'queued',
  SENDING = 'sending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  SUPPRESSED = 'suppressed',
}

export enum SenderRoute {
  NON_MASKING = 'non_masking',
  MASKING = 'masking',
}

/**
 * Reason recorded on a promotional notification that was not delivered, or deferred (FR-NOTIF-051–053).
 * `opted_out` / `rate_limited` end as `suppressed`; `quiet_hours_deferred` stays `queued` with a
 * `deferred_until` for the sweeper; `eligible` proceeds to send; `blocked_no_bn` aborts with `422`.
 */
export enum PromoOutcome {
  ELIGIBLE = 'eligible',
  OPTED_OUT = 'opted_out',
  RATE_LIMITED = 'rate_limited',
  QUIET_HOURS_DEFERRED = 'quiet_hours_deferred',
  BLOCKED_NO_BN = 'blocked_no_bn',
}
