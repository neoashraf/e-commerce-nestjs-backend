import { Injectable } from '@nestjs/common';

import { PaymentMethod } from '../../domain/payment-enums';
import {
  ConfirmResult,
  CreateSessionInput,
  CreateSessionResult,
  IPaymentProvider,
} from './payment-provider.interface';

/**
 * COD provider adapter (FR-PAY-010–012) — no external gateway. `createSession` returns `action: none`
 * (the payment is placed `cod_pending` by the service); confirmation happens out-of-band when an admin
 * marks COD collected. `confirm`/`query` are not applicable and report failed defensively.
 */
@Injectable()
export class CodAdapter implements IPaymentProvider {
  readonly method = PaymentMethod.COD;

  async createSession(_input: CreateSessionInput): Promise<CreateSessionResult> {
    return { action: 'none' };
  }

  async confirm(_reference: string): Promise<ConfirmResult> {
    return { status: 'failed' };
  }

  async query(_reference: string): Promise<ConfirmResult> {
    return { status: 'failed' };
  }
}
