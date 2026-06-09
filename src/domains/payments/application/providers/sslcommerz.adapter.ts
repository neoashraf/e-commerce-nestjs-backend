import { randomUUID } from 'crypto';
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
 * SSLCommerz adapter (FR-PAY-030–034). `createSession` opens a v4 gateway session and returns the
 * hosted GatewayPageURL. The IPN is **authoritative** — `validateIpn` calls the Order Validation API
 * with `val_id` and only reports `paid` for `VALID`/`VALIDATED` (the webhook controller additionally
 * matches amount + tran_id). The browser success/fail/cancel returns are advisory only. Store
 * credentials + environment come from config (sandbox default, BR-PAY-7); no card data is stored.
 *
 * When no store credentials are configured the adapter runs as a DEV stub (logs + a placeholder
 * redirect) so the local flow stays testable without a live gateway.
 */
@Injectable()
export class SslcommerzAdapter implements IPaymentProvider {
  readonly method = PaymentMethod.SSLCOMMERZ;
  private readonly logger = new Logger(SslcommerzAdapter.name);
  private readonly baseUrl: string;
  private readonly isSandbox: boolean;
  private readonly storeId: string;
  private readonly storePasswd: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.isSandbox = (config.get('SSLCOMMERZ_IS_SANDBOX') ?? 'true') !== 'false';
    this.baseUrl = this.isSandbox
      ? 'https://sandbox.sslcommerz.com'
      : 'https://securepay.sslcommerz.com';
    this.storeId = config.get<string>('SSLCOMMERZ_STORE_ID') ?? '';
    this.storePasswd = config.get<string>('SSLCOMMERZ_STORE_PASSWORD') ?? '';
    this.publicBaseUrl = this.normalizeBase(
      config.get<string>('PUBLIC_BASE_URL') ?? 'http://localhost:8000',
    );
  }

  private get configured(): boolean {
    return this.storeId.length > 0 && this.storePasswd.length > 0;
  }

  /** Drop a trailing slash and an optional trailing `/api/v1` so the webhook path is appended once. */
  private normalizeBase(url: string): string {
    return url.replace(/\/+$/, '').replace(/\/api\/v1$/, '');
  }

  private webhookUrl(kind: 'ipn' | 'success' | 'fail' | 'cancel'): string {
    return `${this.publicBaseUrl}/api/v1/webhooks/payments/sslcommerz/${kind}`;
  }

  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    if (!this.configured) {
      // No store credentials yet → DEV stub so the flow stays testable without live creds.
      this.logger.warn(`[DEV SSLCOMMERZ] not configured; stub session for ${input.internalRef}`);
      return {
        action: 'redirect',
        gatewayPaymentId: input.internalRef,
        redirectUrl: `${this.baseUrl}/gwprocess?tran_id=${input.internalRef}`,
      };
    }

    const form = new URLSearchParams({
      store_id: this.storeId,
      store_passwd: this.storePasswd,
      total_amount: Number(input.amount).toFixed(2),
      currency: input.currency,
      tran_id: input.internalRef, // tran_id == internal_ref (IPN looks the payment up by this)
      success_url: this.webhookUrl('success'),
      fail_url: this.webhookUrl('fail'),
      cancel_url: this.webhookUrl('cancel'),
      ipn_url: this.webhookUrl('ipn'),
      shipping_method: 'NO',
      num_of_item: '1',
      product_name: `Order ${input.orderNo}`,
      product_category: 'general',
      product_profile: 'general',
      // Customer details — placeholders are accepted in sandbox. TODO: thread the real customer
      // name/email/phone/address through CreateSessionInput for production receipts & fraud checks.
      cus_name: 'Sports E-Commerce Customer',
      cus_email: this.config.get<string>('MAIL_FROM') ?? 'customer@example.com',
      cus_phone: '01700000000',
      cus_add1: 'Dhaka',
      cus_city: 'Dhaka',
      cus_country: 'Bangladesh',
    });

    const res = await fetch(`${this.baseUrl}/gwprocess/v4/api.php`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const data = (await res.json()) as {
      status?: string;
      failedreason?: string;
      sessionkey?: string;
      GatewayPageURL?: string;
    };

    if (data.status !== 'SUCCESS' || !data.GatewayPageURL) {
      throw new Error(
        `SSLCommerz session failed: ${data.failedreason ?? data.status ?? 'unknown error'}`,
      );
    }

    this.logger.log(`SSLCommerz session created for ${input.internalRef} (key=${data.sessionkey})`);
    return {
      action: 'redirect',
      gatewayPaymentId: data.sessionkey ?? input.internalRef,
      redirectUrl: data.GatewayPageURL,
    };
  }

  /** Validate an IPN via the Order Validation API using val_id (authoritative, FR-PAY-031). */
  async validateIpn(valId: string): Promise<SslValidationResult> {
    if (!this.configured) return { status: 'failed' };

    const url = new URL(`${this.baseUrl}/validator/api/validationserverAPI.php`);
    url.searchParams.set('val_id', valId);
    url.searchParams.set('store_id', this.storeId);
    url.searchParams.set('store_passwd', this.storePasswd);
    url.searchParams.set('format', 'json');
    url.searchParams.set('v', '1');

    const res = await fetch(url.toString());
    const data = (await res.json()) as {
      status?: string;
      amount?: string;
      store_amount?: string;
      bank_tran_id?: string;
    };

    const status = (data.status ?? '').toUpperCase();
    if (status === 'VALID' || status === 'VALIDATED') {
      // Use `amount` (gross transaction amount) for the finalizer's amount match, not store_amount.
      return { status: 'paid', amount: data.amount, gatewayTxnId: data.bank_tran_id };
    }
    // INVALID_TRANSACTION / FAILED / anything else → not a capture.
    this.logger.warn(`SSLCommerz validation for val_id=${valId} returned status=${data.status}`);
    return { status: 'failed' };
  }

  async confirm(reference: string): Promise<ConfirmResult> {
    const result = await this.validateIpn(reference);
    return { status: result.status, gatewayTxnId: result.gatewayTxnId, amount: result.amount };
  }

  /**
   * Transaction status fallback by `tran_id` — the SSLCommerz Transaction Query API (FR-PAY-034). Used by
   * reconciliation when the IPN was lost. Unlike {@link validateIpn} (which needs a post-success `val_id`
   * the gateway only issues on capture), this queries by our own `tran_id`, so it resolves the real status
   * even when no IPN ever arrived. A non-terminal or unreachable result maps to `pending` so the sweep
   * retries instead of wrongly failing an in-flight payment.
   */
  async query(tranId: string): Promise<ConfirmResult> {
    if (!this.configured) return { status: 'pending' };

    const url = new URL(`${this.baseUrl}/validator/api/merchantTransIDvalidationAPI.php`);
    url.searchParams.set('tran_id', tranId);
    url.searchParams.set('store_id', this.storeId);
    url.searchParams.set('store_passwd', this.storePasswd);
    url.searchParams.set('format', 'json');
    url.searchParams.set('v', '1');

    const res = await fetch(url.toString());
    const data = (await res.json()) as {
      APIConnect?: string;
      element?: Array<{ status?: string; amount?: string; bank_tran_id?: string }>;
    };

    // The query API itself failed (network/credentials) — retry next sweep; never fail the payment on this.
    if ((data.APIConnect ?? '').toUpperCase() !== 'DONE') {
      this.logger.warn(`SSLCommerz tx query tran_id=${tranId}: APIConnect=${data.APIConnect ?? 'none'}`);
      return { status: 'pending' };
    }

    const txn = data.element?.find((e) => !!e.status);
    const status = (txn?.status ?? '').toUpperCase();
    switch (status) {
      case 'VALID':
      case 'VALIDATED':
        return { status: 'paid', amount: txn?.amount, gatewayTxnId: txn?.bank_tran_id };
      case 'PENDING':
      case 'PROCESSING':
        return { status: 'pending' };
      case 'CANCELLED':
        return { status: 'cancelled' };
      default:
        // FAILED / EXPIRED / UNATTEMPTED / INVALID_TRANSACTION / not found — after the grace window, not paid.
        this.logger.warn(`SSLCommerz tx query tran_id=${tranId} → status=${txn?.status ?? 'none'}`);
        return { status: 'failed' };
    }
  }

  /**
   * Refund (prepaid-cancel/duplicate only — never post-delivery returns). `reference` must be the
   * `bank_tran_id` captured during validation (refunds.service passes payment.gatewayTxnId).
   */
  async refund(reference: string, amount: string): Promise<RefundResult> {
    if (!this.configured) {
      return { status: 'completed', gatewayRefundRef: `RF-${reference}` };
    }

    const url = new URL(`${this.baseUrl}/validator/api/merchantTransIDvalidationAPI.php`);
    url.searchParams.set('bank_tran_id', reference);
    url.searchParams.set('refund_trans_id', `RFT-${randomUUID().replace(/-/g, '').slice(0, 20)}`);
    url.searchParams.set('refund_amount', Number(amount).toFixed(2));
    url.searchParams.set('refund_remarks', 'Prepaid order cancellation / duplicate capture');
    url.searchParams.set('store_id', this.storeId);
    url.searchParams.set('store_passwd', this.storePasswd);
    url.searchParams.set('format', 'json');
    url.searchParams.set('v', '1');

    const res = await fetch(url.toString());
    const data = (await res.json()) as { status?: string; refund_ref_id?: string };
    const status = (data.status ?? '').toLowerCase();

    this.logger.log(`SSLCommerz refund ${reference} amount=${amount} → ${data.status}`);
    return {
      status: status === 'success' ? 'completed' : status === 'processing' ? 'pending' : 'failed',
      gatewayRefundRef: data.refund_ref_id,
    };
  }
}
