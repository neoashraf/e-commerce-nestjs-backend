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
