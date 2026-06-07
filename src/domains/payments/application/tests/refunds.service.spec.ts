import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { RefundsService } from '../services/refunds.service';
import { ReconService } from '../services/recon.service';
import { PAYMENT_NOTIFIER } from '../ports/payment-notifier.port';
import { PAYMENT_PROVIDERS, IPaymentProvider } from '../providers/payment-provider.interface';
import {
  PaymentMethod,
  PaymentStatus,
  RefundStatus,
} from '../../domain/payment-enums';
import { PaymentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/payment.orm-entity';
import { RefundOrmEntity } from '../../infrastructure/persistence/typeorm/entities/refund.orm-entity';

const bkashProvider: IPaymentProvider = {
  method: PaymentMethod.BKASH,
  createSession: async () => ({ action: 'redirect' }),
  confirm: async () => ({ status: 'failed' }),
  query: async () => ({ status: 'failed' }),
  refund: async () => ({ status: 'completed', gatewayRefundRef: 'RF-1' }),
};

describe('Payments — RefundsService', () => {
  let service: RefundsService;
  let payRepo: { createQueryBuilder: jest.Mock; save: jest.Mock };
  let refundRepo: { create: jest.Mock; save: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let recon: { recordTxn: jest.Mock };
  let notifier: { notify: jest.Mock };

  const buildPayment = (o: Partial<PaymentOrmEntity> = {}): PaymentOrmEntity =>
    ({
      id: 'pay_1',
      orderId: 'ord_1',
      method: PaymentMethod.BKASH,
      amount: '1000.00',
      refundedAmount: '0.00',
      status: PaymentStatus.PAID,
      gatewayPaymentId: 'TR1',
      internalRef: 'PAY-1',
      ...o,
    }) as PaymentOrmEntity;

  const lockReturns = (payment: PaymentOrmEntity | null) => {
    payRepo.createQueryBuilder.mockReturnValue({
      setLock: () => ({ where: () => ({ getOne: () => Promise.resolve(payment) }) }),
    });
  };

  const manager = () => ({
    getRepository: (token: unknown) => (token === PaymentOrmEntity ? payRepo : refundRepo),
  });

  beforeEach(async () => {
    payRepo = {
      createQueryBuilder: jest.fn(),
      save: jest.fn().mockImplementation((p) => Promise.resolve(p)),
    };
    refundRepo = {
      create: jest.fn().mockImplementation((r) => r),
      save: jest.fn().mockImplementation((r) => Promise.resolve({ id: 'rf_1', ...r })),
    };
    dataSource = { transaction: jest.fn().mockImplementation(async (cb) => cb(manager())) };
    recon = { recordTxn: jest.fn() };
    notifier = { notify: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundsService,
        { provide: getRepositoryToken(PaymentOrmEntity), useValue: payRepo },
        { provide: getRepositoryToken(RefundOrmEntity), useValue: refundRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: ReconService, useValue: recon },
        { provide: PAYMENT_PROVIDERS, useValue: [bkashProvider] },
        { provide: PAYMENT_NOTIFIER, useValue: notifier },
      ],
    }).compile();

    service = module.get(RefundsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should fully refund a paid online payment and mark it refunded', async () => {
    lockReturns(buildPayment());
    const result = await service.refund({ paymentId: 'pay_1', amount: '1000.00', reason: 'prepaid_order_cancelled' });
    expect(result.status).toBe(RefundStatus.COMPLETED);
    expect(result.payment_status).toBe(PaymentStatus.REFUNDED);
    expect(notifier.notify).toHaveBeenCalledWith('payment.cancellation_refund', expect.anything());
  });

  it('should mark partially_refunded for a partial refund', async () => {
    lockReturns(buildPayment());
    const result = await service.refund({ paymentId: 'pay_1', amount: '400.00', reason: 'duplicate_capture' });
    expect(result.payment_status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
    expect(payRepo.save).toHaveBeenCalledWith(expect.objectContaining({ refundedAmount: '400.00' }));
  });

  it('should reject a refund exceeding the captured amount (422)', async () => {
    lockReturns(buildPayment({ refundedAmount: '800.00' }));
    await expect(
      service.refund({ paymentId: 'pay_1', amount: '300.00', reason: 'duplicate_capture' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('should reject refunding a COD payment (409 — no captured funds, exchange-only policy)', async () => {
    lockReturns(buildPayment({ method: PaymentMethod.COD, status: PaymentStatus.COD_COLLECTED }));
    await expect(
      service.refund({ paymentId: 'pay_1', amount: '100.00', reason: 'prepaid_order_cancelled' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('should reject refunding a non-paid payment (409)', async () => {
    lockReturns(buildPayment({ status: PaymentStatus.INITIATED }));
    await expect(
      service.refund({ paymentId: 'pay_1', amount: '100.00', reason: 'payment_error' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('should reject a zero/negative refund amount (422)', async () => {
    lockReturns(buildPayment());
    await expect(
      service.refund({ paymentId: 'pay_1', amount: '0.00', reason: 'payment_error' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
