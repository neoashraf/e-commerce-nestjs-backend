import { PaymentMethod } from '../../domain/payment-enums';

/** Input to a provider session creation — the payment to initiate. */
export interface CreateSessionInput {
  paymentId: string;
  internalRef: string;
  orderId: string;
  orderNo: string;
  amount: string;
  currency: string;
}

/** Result of creating a gateway session (online) or accepting COD. */
export interface CreateSessionResult {
  /** `redirect` for online gateways (customer auth), `none` for COD. */
  action: 'redirect' | 'none';
  redirectUrl?: string;
  gatewayPaymentId?: string;
}

/**
 * Outcome of confirming/querying a payment with the gateway (used by pay-gateways-be). `pending` means
 * the gateway has no terminal result yet (still processing, or temporarily unreachable) — the caller
 * must retry rather than finalize, so an in-flight payment is never wrongly marked failed.
 */
export interface ConfirmResult {
  status: 'paid' | 'failed' | 'cancelled' | 'pending';
  gatewayTxnId?: string;
  amount?: string;
}

/** Outcome of a gateway refund call (used by pay-refunds-be). */
export interface RefundResult {
  status: 'completed' | 'pending' | 'failed';
  gatewayRefundRef?: string;
}

/**
 * Gateway-adapter port (FR-PAY-005/020/030; payment-implementation §4). One implementation **per
 * method** keeps use-cases gateway-agnostic. pay-core ships the COD adapter (no external calls) + bKash/
 * SSLCommerz **stubs**; the real online adapters (HTTP clients, tokenization, IPN validation) are
 * pay-gateways-be. `confirm`/`query`/`refund` are defined here but exercised by the gateway/refund slices.
 */
export interface IPaymentProvider {
  readonly method: PaymentMethod;
  createSession(input: CreateSessionInput): Promise<CreateSessionResult>;
  confirm(reference: string): Promise<ConfirmResult>;
  query(reference: string): Promise<ConfirmResult>;
  /** Refund a captured payment (online only). Optional — COD has no captured funds. */
  refund?(reference: string, amount: string): Promise<RefundResult>;
}

/** DI token registry for provider adapters, keyed by method. */
export const PAYMENT_PROVIDERS = Symbol('PAYMENT_PROVIDERS');
