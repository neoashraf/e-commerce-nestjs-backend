import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';

import { ExchangeDifferenceService } from '../services/exchange-difference.service';
import { PaymentsService } from '../services/payments.service';
import { PAYMENT_NOTIFIER } from '../ports/payment-notifier.port';
import { PaymentMethod, PaymentPurpose, PaymentStatus } from '../../domain/payment-enums';

describe('Payments — ExchangeDifferenceService', () => {
  let service: ExchangeDifferenceService;
  let payments: { initiate: jest.Mock };
  let notifier: { notify: jest.Mock };

  beforeEach(async () => {
    payments = {
      initiate: jest.fn().mockResolvedValue({
        payment_id: 'pay_9',
        status: PaymentStatus.INITIATED,
        method: PaymentMethod.BKASH,
        action: 'redirect',
        purpose: PaymentPurpose.EXCHANGE_DIFFERENCE,
      }),
    };
    notifier = { notify: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExchangeDifferenceService,
        { provide: PaymentsService, useValue: payments },
        { provide: PAYMENT_NOTIFIER, useValue: notifier },
      ],
    }).compile();

    service = module.get(ExchangeDifferenceService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a separate exchange_difference capture for the difference amount', async () => {
    const result = await service.initiate({
      order_id: 'ord_1',
      exchange_id: 'ex_1',
      amount: '1500.00',
      method: PaymentMethod.BKASH,
    });
    expect(payments.initiate).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: PaymentPurpose.EXCHANGE_DIFFERENCE, exchange_id: 'ex_1', amount: '1500.00' }),
    );
    expect(result.payment_id).toBe('pay_9');
    expect(notifier.notify).toHaveBeenCalledWith('payment.difference_paid', expect.anything());
  });

  it('should reject a non-positive difference amount (400)', async () => {
    await expect(
      service.initiate({ order_id: 'ord_1', exchange_id: 'ex_1', amount: '0.00', method: PaymentMethod.BKASH }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(payments.initiate).not.toHaveBeenCalled();
  });
});
