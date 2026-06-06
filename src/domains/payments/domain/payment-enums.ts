/** Payment method (SRS 05 §8 Payment.method). */
export enum PaymentMethod {
  COD = 'cod',
  BKASH = 'bkash',
  SSLCOMMERZ = 'sslcommerz',
}

/** Why a payment exists (SRS 05 §8 Payment.purpose). */
export enum PaymentPurpose {
  ORDER = 'order',
  EXCHANGE_DIFFERENCE = 'exchange_difference',
}

/** Full payment lifecycle (SRS 05 §3/§8 Payment.status). */
export enum PaymentStatus {
  PENDING = 'pending',
  INITIATED = 'initiated',
  PAID = 'paid',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  COD_PENDING = 'cod_pending',
  COD_COLLECTED = 'cod_collected',
  REFUND_PENDING = 'refund_pending',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded',
}

/** Refund kind (SRS 05 §8 Refund.type). */
export enum RefundType {
  GATEWAY = 'gateway',
  MANUAL = 'manual',
}

/** Refund lifecycle (SRS 05 §8 Refund.status). */
export enum RefundStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/** Reconciliation-log event kinds (SRS 05 §8 PaymentTransactionLog.event). */
export enum PaymentLogEvent {
  INITIATE = 'initiate',
  CREATE = 'create',
  CALLBACK = 'callback',
  IPN = 'ipn',
  EXECUTE = 'execute',
  QUERY = 'query',
  VALIDATE = 'validate',
  REFUND = 'refund',
}

/** Reconciliation-log outcomes (SRS 05 §8 PaymentTransactionLog.result). */
export enum PaymentLogResult {
  SUCCESS = 'success',
  FAILED = 'failed',
  MISMATCH = 'mismatch',
  DUPLICATE_IGNORED = 'duplicate_ignored',
}

/** Gateway environment (SRS 05 §8 GatewayConfig.environment). */
export enum GatewayEnvironment {
  SANDBOX = 'sandbox',
  LIVE = 'live',
}
