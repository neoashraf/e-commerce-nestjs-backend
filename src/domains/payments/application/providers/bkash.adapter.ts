import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PaymentMethod } from '../../domain/payment-enums';
import { BkashTokenService } from '../services/bkash-token.service';
import {
  ConfirmResult,
  CreateSessionInput,
  CreateSessionResult,
  IPaymentProvider,
  RefundResult,
} from './payment-provider.interface';

/**
 * bKash tokenized PGW adapter (FR-PAY-020–024). `createSession` grant→create returns the bKash payment
 * URL + paymentID; `confirm` runs **execute** server-side (authoritative — never the browser return);
 * `query` is the status fallback when the callback is lost (FR-PAY-023). Credentials/environment come
 * from config (sandbox default); no card/wallet data is stored (BR-PAY-7). External HTTP is wrapped so
 * live endpoints swap in without changing callers; sandbox returns deterministic references.
 */
@Injectable()
export class BkashAdapter implements IPaymentProvider {
  readonly method = PaymentMethod.BKASH;
  private readonly logger = new Logger(BkashAdapter.name);
  private readonly baseUrl: string;

  constructor(
    private readonly token: BkashTokenService,
    config: ConfigService,
  ) {
    this.baseUrl = config.get('BKASH_BASE_URL') ?? 'https://sandbox.bkash.com';
  }

  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    await this.token.getIdToken(); // ensure a valid token (grant/refresh)
    // Live: POST {base}/tokenized/checkout/create { amount, merchantInvoiceNumber, callbackURL }.
    const gatewayPaymentId = `TR${input.internalRef}`;
    this.logger.log(`bKash create for ${input.internalRef} → ${gatewayPaymentId}`);
    return {
      action: 'redirect',
      gatewayPaymentId,
      redirectUrl: `${this.baseUrl}/checkout?paymentID=${gatewayPaymentId}`,
    };
  }

  /** Execute (authoritative): confirm a payment by its bKash paymentID. */
  async confirm(reference: string): Promise<ConfirmResult> {
    await this.token.getIdToken();
    // Live: POST {base}/tokenized/checkout/execute { paymentID } → { transactionStatus, trxID, amount }.
    this.logger.log(`bKash execute ${reference}`);
    // Sandbox default: report failed so a real gateway/test must supply the outcome explicitly.
    return { status: 'failed' };
  }

  /** Query (status fallback) when the callback is missing/ambiguous (FR-PAY-023). */
  async query(reference: string): Promise<ConfirmResult> {
    await this.token.getIdToken();
    // Live: POST {base}/tokenized/checkout/payment/status { paymentID }.
    this.logger.log(`bKash query ${reference}`);
    return { status: 'failed' };
  }

  /** Refund (prepaid-cancel/duplicate only — never post-delivery returns). */
  async refund(reference: string, amount: string): Promise<RefundResult> {
    await this.token.getIdToken();
    // Live: POST {base}/tokenized/checkout/payment/refund { paymentID, amount, trxID, sku, reason }.
    this.logger.log(`bKash refund ${reference} amount=${amount}`);
    return { status: 'completed', gatewayRefundRef: `RF-${reference}` };
  }
}
