import { Injectable, Logger } from '@nestjs/common';

import { PaymentMethod } from '../../domain/payment-enums';
import {
  ConfirmResult,
  CreateSessionInput,
  CreateSessionResult,
  IPaymentProvider,
} from './payment-provider.interface';

/**
 * bKash **stub** adapter — placeholder until pay-gateways-be ships the real tokenized create/execute/
 * query client. `createSession` returns a fake sandbox redirect so checkout flows are exercisable in
 * dev/test; it performs no external calls and stores no card/wallet data (BR-PAY-7).
 */
@Injectable()
export class BkashStubAdapter implements IPaymentProvider {
  readonly method = PaymentMethod.BKASH;
  private readonly logger = new Logger(BkashStubAdapter.name);

  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    this.logger.log(`[stub] bKash createSession for ${input.internalRef}`);
    const gatewayPaymentId = `TR-STUB-${input.internalRef}`;
    return {
      action: 'redirect',
      gatewayPaymentId,
      redirectUrl: `https://sandbox.bkash.com/checkout?paymentID=${gatewayPaymentId}`,
    };
  }

  async confirm(reference: string): Promise<ConfirmResult> {
    this.logger.log(`[stub] bKash confirm ${reference}`);
    return { status: 'failed' };
  }

  async query(reference: string): Promise<ConfirmResult> {
    this.logger.log(`[stub] bKash query ${reference}`);
    return { status: 'failed' };
  }
}
