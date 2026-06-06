import { Injectable, Logger } from '@nestjs/common';

import { PaymentMethod } from '../../domain/payment-enums';
import {
  ConfirmResult,
  CreateSessionInput,
  CreateSessionResult,
  IPaymentProvider,
} from './payment-provider.interface';

/**
 * SSLCommerz **stub** adapter — placeholder until pay-gateways-be ships the real session/IPN-validated
 * client. `createSession` returns a fake gateway redirect for dev/test; no external calls, no sensitive
 * data stored. The authoritative confirmation (IPN + Order Validation API) lives in the real adapter.
 */
@Injectable()
export class SslcommerzStubAdapter implements IPaymentProvider {
  readonly method = PaymentMethod.SSLCOMMERZ;
  private readonly logger = new Logger(SslcommerzStubAdapter.name);

  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    this.logger.log(`[stub] SSLCommerz createSession for ${input.internalRef}`);
    const gatewayPaymentId = `SSL-STUB-${input.internalRef}`;
    return {
      action: 'redirect',
      gatewayPaymentId,
      redirectUrl: `https://sandbox.sslcommerz.com/gwprocess?sessionkey=${gatewayPaymentId}`,
    };
  }

  async confirm(reference: string): Promise<ConfirmResult> {
    this.logger.log(`[stub] SSLCommerz confirm ${reference}`);
    return { status: 'failed' };
  }

  async query(reference: string): Promise<ConfirmResult> {
    this.logger.log(`[stub] SSLCommerz query ${reference}`);
    return { status: 'failed' };
  }
}
