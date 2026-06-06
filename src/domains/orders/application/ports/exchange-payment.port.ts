import { Injectable, Logger } from '@nestjs/common';

/** Request a price-difference top-up for a higher-value replacement (FR-ORD-048). */
export interface ExchangeDifferenceRequest {
  orderId: string;
  orderNo: string;
  exchangeId: string;
  /** Positive top-up amount the customer must pay before issuance (Decimal string). */
  amount: string;
}

export interface ExchangeDifferenceResult {
  /** PAY payment id for the difference capture — stored on the exchange and re-checked before issue. */
  paymentId: string;
  /** Latest capture status; issuance is blocked until `paid`. */
  status: 'paid' | 'pending' | 'failed';
  /** Gateway redirect for an online top-up, when the capture needs customer action. */
  redirectUrl?: string | null;
}

/**
 * Outbound port to PAY for the exchange price-difference top-up (FR-ORD-048, BR-ORD-8). The real impl is
 * pay-refunds-be's `ExchangeDifferenceService` (`purpose = exchange_difference`, linked `exchange_id`),
 * confirmed `paid` via the same execute/IPN flow before ORD issues the replacement. A lower-value
 * replacement never reaches here (no cash back). Until wired in-process, {@link StubExchangePayment}
 * logs the intent and reports the difference as immediately `paid` so dev/test flows complete.
 */
export interface IExchangePayment {
  /** Initiate the difference capture; returns the payment id + current status. */
  initiateDifference(input: ExchangeDifferenceRequest): Promise<ExchangeDifferenceResult>;
  /** Whether a previously-initiated difference capture has settled `paid` (re-checked before issue). */
  isDifferencePaid(paymentId: string): Promise<boolean>;
}

export const EXCHANGE_PAYMENT = Symbol('IExchangePayment');

/** Default logging stub for the PAY exchange-difference seam until pay-refunds-be is wired (BW5). */
@Injectable()
export class StubExchangePayment implements IExchangePayment {
  private readonly logger = new Logger(StubExchangePayment.name);

  async initiateDifference(input: ExchangeDifferenceRequest): Promise<ExchangeDifferenceResult> {
    this.logger.log(
      `[stub] PAY exchange-difference for order ${input.orderNo} exchange ${input.exchangeId} amount ${input.amount}`,
    );
    return { paymentId: `stub-diff-${input.exchangeId}`, status: 'paid', redirectUrl: null };
  }

  async isDifferencePaid(paymentId: string): Promise<boolean> {
    this.logger.log(`[stub] PAY difference paid check for ${paymentId}`);
    return true;
  }
}
