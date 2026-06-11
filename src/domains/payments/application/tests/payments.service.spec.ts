import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { PaymentsService } from '../services/payments.service';
import { ReconService } from '../services/recon.service';
import { ReconciliationTask } from '../services/reconciliation.task';
import { SettingsService } from '../services/settings.service';
import { ORDER_GATEWAY } from '../ports/order-gateway.port';
import { PAYMENT_PROVIDERS } from '../providers/payment-provider.interface';
import { CodAdapter } from '../providers/cod.adapter';
import { IPaymentProvider } from '../providers/payment-provider.interface';
import { PaymentMethod, PaymentStatus } from '../../domain/payment-enums';

/** Minimal bKash-method provider for the registry (real adapter is exercised in pay-gateways-test). */
const bkashTestProvider: IPaymentProvider = {
  method: PaymentMethod.BKASH,
  createSession: async () => ({ action: 'redirect', gatewayPaymentId: 'TR-TEST', redirectUrl: 'https://bkash/checkout?paymentID=TR-TEST' }),
  confirm: async () => ({ status: 'failed' }),
  query: async () => ({ status: 'failed' }),
};
import { PaymentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/payment.orm-entity';

describe('Payments — PaymentsService', () => {
  let service: PaymentsService;
  let payments: { findOne: jest.Mock; find: jest.Mock; create: jest.Mock; save: jest.Mock };
  let settings: { isMethodEnabled: jest.Mock };
  let recon: { recordTxn: jest.Mock };
  let orders: { getOrder: jest.Mock; markOrderPaid: jest.Mock; markOrderPaymentFailed: jest.Mock };

  const order = { orderId: 'ord_1', orderNo: 'SO-100000', grandTotal: '12620.00', isPendingPayment: true };

  beforeEach(async () => {
    payments = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((p) => p),
      save: jest.fn().mockImplementation((p) => Promise.resolve({ id: p.id ?? 'pay_1', ...p })),
    };
    settings = { isMethodEnabled: jest.fn().mockResolvedValue(true) };
    recon = { recordTxn: jest.fn().mockResolvedValue({}) };
    orders = {
      getOrder: jest.fn().mockResolvedValue(order),
      markOrderPaid: jest.fn(),
      markOrderPaymentFailed: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getRepositoryToken(PaymentOrmEntity), useValue: payments },
        { provide: PAYMENT_PROVIDERS, useValue: [new CodAdapter(), bkashTestProvider] },
        { provide: ORDER_GATEWAY, useValue: orders },
        { provide: SettingsService, useValue: settings },
        { provide: ReconService, useValue: recon },
        { provide: ReconciliationTask, useValue: { reconcileOnDemand: jest.fn() } },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should initiate a COD payment as cod_pending with action none', async () => {
    const result = await service.initiate({ order_id: 'ord_1', method: PaymentMethod.COD });
    expect(result.status).toBe(PaymentStatus.COD_PENDING);
    expect(result.action).toBe('none');
    expect(payments.save).toHaveBeenCalledWith(
      expect.objectContaining({ method: PaymentMethod.COD, status: PaymentStatus.COD_PENDING }),
    );
  });

  it('should initiate COD even when the order is confirmed (not pending) — COD is placed confirmed', async () => {
    // Real COD orders are created `confirmed` + `cod_pending`, so isPendingPayment is false.
    orders.getOrder.mockResolvedValue({ ...order, isPendingPayment: false });
    const result = await service.initiate({ order_id: 'ord_1', method: PaymentMethod.COD });
    expect(result.status).toBe(PaymentStatus.COD_PENDING);
    expect(result.action).toBe('none');
  });

  it('should initiate an online payment as initiated with a redirect (stub)', async () => {
    const result = await service.initiate({ order_id: 'ord_1', method: PaymentMethod.BKASH });
    expect(result.status).toBe(PaymentStatus.INITIATED);
    expect(result.action).toBe('redirect');
    expect(result.redirect_url).toContain('bkash');
  });

  it('should set the amount to the order grand total', async () => {
    await service.initiate({ order_id: 'ord_1', method: PaymentMethod.BKASH });
    expect(payments.save).toHaveBeenCalledWith(expect.objectContaining({ amount: '12620.00' }));
  });

  it('should reject initiation when a completed payment already exists (409)', async () => {
    payments.findOne.mockResolvedValue({ id: 'pay_old', status: PaymentStatus.PAID });
    await expect(
      service.initiate({ order_id: 'ord_1', method: PaymentMethod.BKASH }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('should reject initiation when the method is disabled (400)', async () => {
    settings.isMethodEnabled.mockResolvedValue(false);
    await expect(
      service.initiate({ order_id: 'ord_1', method: PaymentMethod.BKASH }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should reject initiation when the order is not pending payment (400)', async () => {
    orders.getOrder.mockResolvedValue({ ...order, isPendingPayment: false });
    await expect(
      service.initiate({ order_id: 'ord_1', method: PaymentMethod.BKASH }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should record a reconciliation entry on initiate', async () => {
    await service.initiate({ order_id: 'ord_1', method: PaymentMethod.COD });
    expect(recon.recordTxn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'initiate' }),
    );
  });

  it('should supersede a prior failed attempt on retry', async () => {
    payments.find.mockResolvedValue([{ id: 'pay_old', status: PaymentStatus.FAILED }]);
    const result = await service.retry('ord_1', PaymentMethod.BKASH);
    // prior failed attempt cancelled, then a new payment created.
    expect(payments.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pay_old', status: PaymentStatus.CANCELLED }),
    );
    expect(result.status).toBe(PaymentStatus.INITIATED);
  });

  it('should reject retry when a completed payment already exists (409)', async () => {
    payments.find.mockResolvedValue([{ id: 'pay_old', status: PaymentStatus.PAID }]);
    await expect(service.retry('ord_1', PaymentMethod.BKASH)).rejects.toBeInstanceOf(ConflictException);
  });
});
