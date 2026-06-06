import { Injectable, Logger } from '@nestjs/common';

/** Input for a prepaid-cancellation gateway refund request (FR-ORD-040/041). */
export interface CancellationRefundRequest {
  orderId: string;
  orderNo: string;
  /** Prepaid amount to refund to source — the order grand total (Decimal string). */
  amount: string;
  reason: string;
}

export interface CancellationRefundResult {
  /** Whether a gateway refund was triggered. PAY confirms completion asynchronously (FR-ORD-042). */
  triggered: boolean;
}

/**
 * Outbound port to PAY for the prepaid-cancellation refund (FR-ORD-040/041). The real impl is
 * pay-refunds-be's refund service; when a prepaid (`paid`) online order is cancelled, the fulfilment
 * service asks PAY to refund the prepaid amount to source. PAY then reflects `refunded` back through
 * the internal payment-state endpoint, which sets the order `refunded` (FR-ORD-042). Until wired
 * in-process, {@link StubRefundRequester} logs the intent and reports `triggered: true`.
 */
export interface IRefundRequester {
  requestCancellationRefund(input: CancellationRefundRequest): Promise<CancellationRefundResult>;
}

export const REFUND_REQUESTER = Symbol('IRefundRequester');

/** Default logging stub for the PAY refund seam until pay-refunds-be is wired in-process (BW5). */
@Injectable()
export class StubRefundRequester implements IRefundRequester {
  private readonly logger = new Logger(StubRefundRequester.name);

  async requestCancellationRefund(
    input: CancellationRefundRequest,
  ): Promise<CancellationRefundResult> {
    this.logger.log(
      `[stub] PAY cancellation refund for order ${input.orderNo} amount ${input.amount} (${input.reason})`,
    );
    return { triggered: true };
  }
}
