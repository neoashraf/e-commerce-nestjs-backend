import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PaymentLogEvent } from '../../domain/payment-enums';
import { BkashAdapter } from '../providers/bkash.adapter';
import { SslcommerzAdapter } from '../providers/sslcommerz.adapter';
import { GatewayFinalizerService } from './gateway-finalizer.service';
import { PaymentsService } from './payments.service';

export interface WebhookOutcome {
  redirectUrl: string;
}

/**
 * Gateway webhook orchestration (FR-PAY-040–042). bKash callback → server-side **execute** (authoritative)
 * → finalize → redirect to the storefront result (advisory). SSLCommerz IPN → **validate** via the Order
 * Validation API → match amount + tran_id → finalize → always respond 200 to stop provider retries. The
 * browser success/fail/cancel returns only redirect; they never finalize a payment (BR-PAY-2/3). All
 * finalization is idempotent by gateway reference (GatewayFinalizerService).
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly resultBaseUrl: string;

  constructor(
    private readonly payments: PaymentsService,
    private readonly finalizer: GatewayFinalizerService,
    private readonly bkash: BkashAdapter,
    private readonly sslcommerz: SslcommerzAdapter,
    config: ConfigService,
  ) {
    this.resultBaseUrl =
      config.get('STOREFRONT_RESULT_URL') ?? 'http://localhost:3000/checkout/result';
  }

  // ---------------------------------------------------------------------------
  // bKash callback → execute (FR-PAY-022, 040, 041)
  // ---------------------------------------------------------------------------

  async handleBkashCallback(paymentID: string | undefined, status: string | undefined): Promise<WebhookOutcome> {
    if (!paymentID) {
      return { redirectUrl: this.resultUrl(null, 'failed') };
    }
    const payment = await this.payments.findByGatewayPaymentId(paymentID);
    if (!payment) {
      return { redirectUrl: this.resultUrl(null, 'failed') };
    }

    // The browser `status` is advisory; the server-side execute decides the outcome (BR-PAY-3).
    if (status && status.toLowerCase() !== 'success') {
      await this.finalizer.finalize({
        paymentId: payment.id,
        outcome: status.toLowerCase() === 'cancel' ? 'cancelled' : 'failed',
        gatewayReference: paymentID,
        event: PaymentLogEvent.CALLBACK,
      });
      return { redirectUrl: this.resultUrl(payment.orderId, 'failed') };
    }

    const execed = await this.bkash.confirm(paymentID);
    const result = await this.finalizer.finalize({
      paymentId: payment.id,
      // bKash execute is terminal; coerce any non-terminal status to failed (never finalize `pending`).
      outcome: execed.status === 'paid' ? 'paid' : execed.status === 'cancelled' ? 'cancelled' : 'failed',
      gatewayReference: paymentID,
      gatewayTxnId: execed.gatewayTxnId ?? null,
      validatedAmount: execed.amount ?? null,
      event: PaymentLogEvent.EXECUTE,
    });

    return { redirectUrl: this.resultUrl(payment.orderId, result.status === 'paid' ? 'success' : 'failed') };
  }

  // ---------------------------------------------------------------------------
  // SSLCommerz IPN → validate (FR-PAY-031–034, 040, 041)
  // ---------------------------------------------------------------------------

  /** Process an IPN. Always returns (the controller always answers 200). */
  async handleSslcommerzIpn(body: {
    tran_id?: string;
    val_id?: string;
    amount?: string;
    status?: string;
  }): Promise<{ received: true }> {
    if (!body.tran_id) return { received: true };
    const payment = await this.payments.findByInternalRef(body.tran_id);
    if (!payment) return { received: true };

    // Provider status FAILED/CANCELLED → finalize without validating a capture.
    const status = (body.status ?? '').toUpperCase();
    if (status === 'FAILED' || status === 'CANCELLED') {
      await this.finalizer.finalize({
        paymentId: payment.id,
        outcome: status === 'CANCELLED' ? 'cancelled' : 'failed',
        gatewayReference: body.val_id ?? body.tran_id,
        event: PaymentLogEvent.IPN,
      });
      return { received: true };
    }

    // Authoritative: validate via the Order Validation API (BR-PAY-2, FR-PAY-031).
    const validation = body.val_id
      ? await this.sslcommerz.validateIpn(body.val_id)
      : { status: 'failed' as const };

    await this.finalizer.finalize({
      paymentId: payment.id,
      outcome: validation.status,
      gatewayReference: body.val_id ?? body.tran_id,
      gatewayTxnId: validation.gatewayTxnId ?? null,
      // Match amount: prefer the validated amount; the finalizer flags a mismatch vs the payment.
      validatedAmount: validation.status === 'paid' ? validation.amount ?? body.amount ?? null : null,
      event: PaymentLogEvent.VALIDATE,
    });

    return { received: true };
  }

  // ---------------------------------------------------------------------------
  // Advisory browser returns (never finalize)
  // ---------------------------------------------------------------------------

  advisoryRedirect(tranId: string | undefined, kind: 'success' | 'fail' | 'cancel'): WebhookOutcome {
    const status = kind === 'success' ? 'pending' : kind === 'cancel' ? 'cancelled' : 'failed';
    return { redirectUrl: this.resultUrl(null, status, tranId) };
  }

  private resultUrl(orderId: string | null, status: string, ref?: string): string {
    const params = new URLSearchParams({ status });
    if (orderId) params.set('order', orderId);
    if (ref) params.set('ref', ref);
    return `${this.resultBaseUrl}?${params.toString()}`;
  }
}
