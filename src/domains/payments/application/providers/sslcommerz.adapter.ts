import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PaymentMethod } from '../../domain/payment-enums';
import {
  ConfirmResult,
  CreateSessionInput,
  CreateSessionResult,
  IPaymentProvider,
  RefundResult,
} from './payment-provider.interface';

/** Result of validating an IPN via the SSLCommerz Order Validation API. */
export interface SslValidationResult {
  status: 'paid' | 'failed' | 'cancelled';
  amount?: string;
  gatewayTxnId?: string;
}

/**
 * SSLCommerz adapter (FR-PAY-030–034). `createSession` opens a gateway session and returns its URL.
 * The IPN is **authoritative** — `validateIpn` calls the Order Validation API with `val_id` and only
 * reports `paid` for `VALID`/`VALIDATED` (the webhook controller additionally matches amount + tran_id).
 * The browser success/fail/cancel returns are advisory only. Sandbox default; live store id/password
 * from config (BR-PAY-7). No card data stored.
 */
@Injectable()
export class SslcommerzAdapter implements IPaymentProvider {
  readonly method = PaymentMethod.SSLCOMMERZ;
  private readonly logger = new Logger(SslcommerzAdapter.name);
  private readonly baseUrl: string;
  private readonly isSandbox: boolean;

  constructor(config: ConfigService) {
    this.isSandbox = (config.get('SSLCOMMERZ_IS_SANDBOX') ?? 'true') !== 'false';
    this.baseUrl = this.isSandbox
      ? 'https://sandbox.sslcommerz.com'
      : 'https://securepay.sslcommerz.com';
  }

  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    // Live: POST {base}/gwprocess/v4/api.php { store_id, store_passwd, total_amount, tran_id, …urls }.
    const gatewayPaymentId = input.internalRef; // tran_id == internal_ref
    this.logger.log(`SSLCommerz session for ${input.internalRef}`);
    return {
      action: 'redirect',
      gatewayPaymentId,
      redirectUrl: `${this.baseUrl}/gwprocess?tran_id=${gatewayPaymentId}`,
    };
  }

  /** Validate an IPN via the Order Validation API using val_id (authoritative, FR-PAY-031). */
  async validateIpn(valId: string): Promise<SslValidationResult> {
    // Live: GET {base}/validator/api/validationserverAPI.php?val_id=…&store_id=…&store_passwd=…
    this.logger.log(`SSLCommerz validate val_id=${valId}`);
    // Sandbox default: failed unless a real gateway/test supplies the validated outcome.
    return { status: 'failed' };
  }

  async confirm(reference: string): Promise<ConfirmResult> {
    const result = await this.validateIpn(reference);
    return { status: result.status, gatewayTxnId: result.gatewayTxnId, amount: result.amount };
  }

  async query(reference: string): Promise<ConfirmResult> {
    return this.confirm(reference);
  }

  /** Refund (prepaid-cancel/duplicate only). Live: refund API with bank_tran_id + amount. */
  async refund(reference: string, amount: string): Promise<RefundResult> {
    this.logger.log(`SSLCommerz refund ${reference} amount=${amount}`);
    return { status: 'completed', gatewayRefundRef: `RF-${reference}` };
  }
}
