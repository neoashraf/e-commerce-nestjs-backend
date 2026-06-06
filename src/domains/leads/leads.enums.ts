/**
 * LEAD domain enums (SRS 08 §4, §8). Enquiry type, lead lifecycle status, capture source,
 * thread message direction, and the outbound reply channel.
 */

/** Enquiry type (SRS §4 "Enquiry Type"). `claim_return` requires an order reference + may carry evidence. */
export enum LeadType {
  GENERAL = 'general',
  PRODUCT = 'product',
  ORDER_ISSUE = 'order_issue',
  CLAIM_RETURN = 'claim_return',
  BULK_ORDER = 'bulk_order',
  FEEDBACK = 'feedback',
}

/** Lead lifecycle (SRS §4 "Status"): `new` → `open` → `awaiting_customer` → `resolved` → `closed`; plus `spam`. */
export enum LeadStatus {
  NEW = 'new',
  OPEN = 'open',
  AWAITING_CUSTOMER = 'awaiting_customer',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  SPAM = 'spam',
}

/** Where the lead was captured (SRS §8 Lead.source). */
export enum LeadSource {
  GET_HELP = 'get_help',
  CONTACT_PAGE = 'contact_page',
  PRODUCT_PAGE = 'product_page',
}

/** Thread message direction (SRS §8 LeadMessage.direction). */
export enum MessageDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

/** Delivery channel for an outbound (admin) reply (SRS §8 LeadMessage.channel). */
export enum MessageChannel {
  EMAIL = 'email',
  SMS = 'sms',
}
