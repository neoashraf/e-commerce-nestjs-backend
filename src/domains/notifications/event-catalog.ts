import { NotificationCategory, NotificationChannel } from './notification.enums';

export interface EventDefinition {
  category: NotificationCategory;
  channels: NotificationChannel[];
  requiredPlaceholders: string[];
}

/**
 * In-scope transactional event catalog (SRS 09 Appendix A — OTP/email rows).
 * Unknown event types, or a channel not allowed for an event, are rejected (FR-NOTIF-006).
 */
export const EVENT_CATALOG: Record<string, EventDefinition> = {
  'otp.register': { category: NotificationCategory.TRANSACTIONAL, channels: [NotificationChannel.SMS], requiredPlaceholders: ['code', 'ttl_minutes'] },
  'otp.login': { category: NotificationCategory.TRANSACTIONAL, channels: [NotificationChannel.SMS], requiredPlaceholders: ['code', 'ttl_minutes'] },
  'otp.phone_change': { category: NotificationCategory.TRANSACTIONAL, channels: [NotificationChannel.SMS], requiredPlaceholders: ['code', 'ttl_minutes'] },
  'otp.password_reset': { category: NotificationCategory.TRANSACTIONAL, channels: [NotificationChannel.SMS], requiredPlaceholders: ['code', 'ttl_minutes'] },
  'auth.email_verify': { category: NotificationCategory.TRANSACTIONAL, channels: [NotificationChannel.EMAIL], requiredPlaceholders: ['name', 'verify_url'] },
  'auth.password_reset': { category: NotificationCategory.TRANSACTIONAL, channels: [NotificationChannel.EMAIL], requiredPlaceholders: ['name', 'reset_url'] },
  'admin.invite': { category: NotificationCategory.TRANSACTIONAL, channels: [NotificationChannel.EMAIL], requiredPlaceholders: ['name', 'invite_url'] },
  'admin.password_reset': { category: NotificationCategory.TRANSACTIONAL, channels: [NotificationChannel.EMAIL], requiredPlaceholders: ['name', 'reset_url'] },
  'admin.2fa': { category: NotificationCategory.TRANSACTIONAL, channels: [NotificationChannel.EMAIL, NotificationChannel.SMS], requiredPlaceholders: ['code'] },
};

export function getEventDefinition(eventType: string): EventDefinition | undefined {
  return EVENT_CATALOG[eventType];
}
