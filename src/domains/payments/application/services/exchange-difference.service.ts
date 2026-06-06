import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { PaymentMethod, PaymentPurpose } from '../../domain/payment-enums';
import {
  IPaymentNotifier,
  PAYMENT_NOTIFIER,
} from '../ports/payment-notifier.port';
import { InitiateResult, PaymentsService } from './payments.service';

export interface ExchangeDifferenceCommand {
  order_id: string;
  exchange_id: string;
  amount: string;
  method: PaymentMethod;
}

/**
 * Exchange price-difference top-up (FR-PAY-053, BR-PAY-6b). A higher-value replacement is funded by a
 * **new, separate capture** (`purpose = exchange_difference`, linked `exchange_id`) — confirmed `paid`
 * via the same execute/IPN flow before ORD issues the replacement. A lower-value replacement returns no
 * cash (never reaches here). `400` if the amount ≤ 0.
 */
@Injectable()
export class ExchangeDifferenceService {
  constructor(
    private readonly payments: PaymentsService,
    @Inject(PAYMENT_NOTIFIER) private readonly notifier: IPaymentNotifier,
  ) {}

  async initiate(cmd: ExchangeDifferenceCommand): Promise<InitiateResult> {
    if (Number(cmd.amount) <= 0) {
      throw new BadRequestException({
        code: 'INVALID_AMOUNT',
        message: 'Exchange price difference must be greater than zero.',
      });
    }

    const result = await this.payments.initiate({
      order_id: cmd.order_id,
      method: cmd.method,
      purpose: PaymentPurpose.EXCHANGE_DIFFERENCE,
      exchange_id: cmd.exchange_id,
      amount: cmd.amount,
    });

    await this.notifier.notify('payment.difference_paid', {
      orderId: cmd.order_id,
      exchangeId: cmd.exchange_id,
      amount: cmd.amount,
      status: result.status,
    });

    return result;
  }
}
