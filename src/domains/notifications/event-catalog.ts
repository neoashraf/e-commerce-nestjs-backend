import { NotificationCategory, NotificationChannel } from './notification.enums';

export interface EventDefinition {
  category: NotificationCategory;
  channels: NotificationChannel[];
  /** Placeholders that MUST appear in a template body for this event (FR-NOTIF-011). */
  requiredPlaceholders: string[];
  /** Additional placeholders a template MAY use (the "defined" set = required ∪ optional). */
  optionalPlaceholders?: string[];
  /**
   * Promotional/campaign events whose body may reference arbitrary, campaign-specific
   * placeholders (Appendix A `promo.campaign`); only the only-defined check is relaxed —
   * required placeholders are still enforced.
   */
  allowAnyPlaceholder?: boolean;
}

const SMS = NotificationChannel.SMS;
const EMAIL = NotificationChannel.EMAIL;
const TX = NotificationCategory.TRANSACTIONAL;
const PROMO = NotificationCategory.PROMOTIONAL;

/**
 * Notification event catalog (SRS 09 Appendix A) — maintained in code, not a user table (SRS §8).
 * Each event fixes its category, allowed channels, and the placeholder set the template manager
 * validates against (FR-NOTIF-006/011) and the dispatch core renders with. Unknown event types,
 * or a channel not allowed for an event, are rejected.
 */
export const EVENT_CATALOG: Record<string, EventDefinition> = {
  // AUTH / RBAC — OTP + transactional email (dispatch core seeds these)
  'otp.register': { category: TX, channels: [SMS], requiredPlaceholders: ['code', 'ttl_minutes'] },
  'otp.login': { category: TX, channels: [SMS], requiredPlaceholders: ['code', 'ttl_minutes'] },
  'otp.phone_change': { category: TX, channels: [SMS], requiredPlaceholders: ['code', 'ttl_minutes'] },
  'otp.password_reset': { category: TX, channels: [SMS], requiredPlaceholders: ['code', 'ttl_minutes'] },
  'otp.password_set': { category: TX, channels: [SMS], requiredPlaceholders: ['code', 'ttl_minutes'] },
  'auth.email_verify': { category: TX, channels: [EMAIL], requiredPlaceholders: ['name', 'verify_url'] },
  // Verify-before-attach email change (FR-AUTH-041/046): code to the NEW address + notice to the OLD.
  'auth.email_change_verify': { category: TX, channels: [EMAIL], requiredPlaceholders: ['code'], optionalPlaceholders: ['name', 'ttl_minutes', 'otp'] },
  'auth.email_changed': { category: TX, channels: [EMAIL], requiredPlaceholders: ['name'], optionalPlaceholders: ['new_email'] },
  'auth.password_reset': { category: TX, channels: [EMAIL], requiredPlaceholders: ['name', 'reset_url'], optionalPlaceholders: ['expires_minutes'] },
  'admin.invite': { category: TX, channels: [EMAIL], requiredPlaceholders: ['name', 'invite_url'], optionalPlaceholders: ['role'] },
  'admin.password_reset': { category: TX, channels: [EMAIL], requiredPlaceholders: ['name', 'reset_url'] },
  'admin.2fa': { category: TX, channels: [EMAIL, SMS], requiredPlaceholders: ['code'], optionalPlaceholders: ['ttl_minutes'] },
  // MFA (module 17) — customer login second factor over email/SMS (FR-MFA-012/021).
  'otp.login_2fa': { category: TX, channels: [EMAIL, SMS], requiredPlaceholders: ['code'], optionalPlaceholders: ['ttl_minutes', 'otp'] },
  'auth.mfa_changed': { category: TX, channels: [EMAIL, SMS], requiredPlaceholders: ['state'], optionalPlaceholders: ['name'] },

  // ORD / PAY — order lifecycle
  'order.placed': { category: TX, channels: [SMS, EMAIL], requiredPlaceholders: ['name', 'order_no'], optionalPlaceholders: ['total', 'payment_method'] },
  'order.payment_reminder': { category: TX, channels: [SMS, EMAIL], requiredPlaceholders: ['name', 'order_no'], optionalPlaceholders: ['pay_url', 'expires_in_minutes'] },
  'order.confirmed': { category: TX, channels: [SMS, EMAIL], requiredPlaceholders: ['name', 'order_no'] },
  'payment.received': { category: TX, channels: [SMS, EMAIL], requiredPlaceholders: ['name', 'order_no'], optionalPlaceholders: ['amount'] },
  'order.processing': { category: TX, channels: [SMS], requiredPlaceholders: ['name', 'order_no'] },
  'order.shipped': { category: TX, channels: [SMS, EMAIL], requiredPlaceholders: ['name', 'order_no'], optionalPlaceholders: ['courier', 'tracking_no'] },
  'order.out_for_delivery': { category: TX, channels: [SMS], requiredPlaceholders: ['name', 'order_no'] },
  'order.delivered': { category: TX, channels: [SMS, EMAIL], requiredPlaceholders: ['name', 'order_no'] },
  'order.cancelled': { category: TX, channels: [SMS, EMAIL], requiredPlaceholders: ['name', 'order_no'], optionalPlaceholders: ['reason'] },
  'order.refunded': { category: TX, channels: [SMS, EMAIL], requiredPlaceholders: ['name', 'order_no'], optionalPlaceholders: ['amount'] },

  // ORD — exchanges
  'exchange.requested': { category: TX, channels: [SMS, EMAIL], requiredPlaceholders: ['name', 'order_no', 'exchange_id'] },
  'exchange.approved': { category: TX, channels: [SMS, EMAIL], requiredPlaceholders: ['name', 'order_no', 'exchange_id'] },
  'exchange.rejected': { category: TX, channels: [SMS, EMAIL], requiredPlaceholders: ['name', 'order_no', 'exchange_id'], optionalPlaceholders: ['reason'] },
  'exchange.difference_due': { category: TX, channels: [SMS, EMAIL], requiredPlaceholders: ['name', 'order_no'], optionalPlaceholders: ['amount', 'pay_url'] },
  'exchange.replacement_dispatched': { category: TX, channels: [SMS, EMAIL], requiredPlaceholders: ['name', 'order_no'], optionalPlaceholders: ['replacement_order_no', 'courier', 'tracking_no'] },

  // LEAD / INV — lead events are email-only (client decision; SMS stays off for leads)
  'lead.received_ack': { category: TX, channels: [EMAIL], requiredPlaceholders: ['name', 'ticket_no'] },
  'lead.reply': { category: TX, channels: [EMAIL], requiredPlaceholders: ['name', 'ticket_no', 'reply_body'] },
  'inventory.low_stock_alert': { category: TX, channels: [EMAIL], requiredPlaceholders: ['sku_code', 'product_title', 'qty'] },

  // Marketing — promotional campaign (campaign-specific placeholders allowed)
  'promo.campaign': { category: PROMO, channels: [SMS, EMAIL], requiredPlaceholders: ['name'], allowAnyPlaceholder: true },
};

export function getEventDefinition(eventType: string): EventDefinition | undefined {
  return EVENT_CATALOG[eventType];
}

/** The full set of placeholders a template for this event may reference (required ∪ optional). */
export function getAllowedPlaceholders(def: EventDefinition): string[] {
  return [...new Set([...def.requiredPlaceholders, ...(def.optionalPlaceholders ?? [])])];
}

/** Event types in the `promotional` category (used for the missing-bn-template warning, FR-NOTIF-013). */
export function getPromotionalEventTypes(): string[] {
  return Object.entries(EVENT_CATALOG)
    .filter(([, def]) => def.category === NotificationCategory.PROMOTIONAL)
    .map(([eventType]) => eventType);
}
