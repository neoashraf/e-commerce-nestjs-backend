import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { GatewayFinalizerService } from '../services/gateway-finalizer.service';
import { ReconService } from '../services/recon.service';
import { ORDER_GATEWAY } from '../ports/order-gateway.port';
import {
  PaymentLogEvent,
  PaymentMethod,
  PaymentStatus,
} from '../../domain/payment-enums';
import { PaymentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/payment.orm-entity';
import { PaymentTransactionLogOrmEntity } from '../../infrastructure/persistence/typeorm/entities/payment-transaction-log.orm-entity';

const NOW = new Date('2026-06-03T10:05:11Z');

describe('Payments — GatewayFinalizerService', () => {
  let service: GatewayFinalizerService;
  let payRepo: { findOne: jest.Mock; save: jest.Mock; createQueryBuilder: jest.Mock };
  let logRepo: { create: jest.Mock; save: jest.Mock };
  let dataSource: { transaction: jest.Mock; getRepository: jest.Mock };
  let recon: { hasProcessed: jest.Mock; recordTxn: jest.Mock };
  let orders: { markOrderPaid: jest.Mock; markOrderPaymentFailed: jest.Mock };

  const lockReturns = (payment: PaymentOrmEntity | null) => {
    payRepo.createQueryBuilder.mockReturnValue({
      setLock: () => ({ where: () => ({ getOne: () => Promise.resolve(payment) }) }),
    });
  };

  const manager = () => ({
    getRepository: (token: unknown) => (token === PaymentOrmEntity ? payRepo : logRepo),
  });

  const buildPayment = (o: Partial<PaymentOrmEntity> = {}): PaymentOrmEntity =>
    ({
      id: 'pay_1',
      orderId: 'ord_1',
      method: PaymentMethod.BKASH,
      amount: '12241.20',
      status: PaymentStatus.INITIATED,
      gatewayTxnId: null,
      ...o,
    }) as PaymentOrmEntity;

  beforeEach(async () => {
    payRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((p) => Promise.resolve(p)),
      createQueryBuilder: jest.fn(),
    };
    logRepo = {
      create: jest.fn().mockImplementation((l) => l),
      save: jest.fn().mockImplementation((l) => Promise.resolve(l)),
    };
    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb) => cb(manager())),
      getRepository: jest.fn().mockReturnValue(payRepo),
    };
    recon = { hasProcessed: jest.fn().mockResolvedValue(false), recordTxn: jest.fn() };
    orders = { markOrderPaid: jest.fn(), markOrderPaymentFailed: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GatewayFinalizerService,
        { provide: DataSource, useValue: dataSource },
        { provide: ReconService, useValue: recon },
        { provide: ORDER_GATEWAY, useValue: orders },
      ],
    }).compile();

    service = module.get(GatewayFinalizerService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should mark paid and propagate to the order when amount matches', async () => {
    lockReturns(buildPayment());
    const result = await service.finalize(
      {
        paymentId: 'pay_1',
        outcome: 'paid',
        gatewayReference: 'BKH99X2',
        gatewayTxnId: 'TRX1',
        validatedAmount: '12241.20',
        event: PaymentLogEvent.EXECUTE,
      },
      NOW,
    );
    expect(result.status).toBe(PaymentStatus.PAID);
    expect(payRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: PaymentStatus.PAID, gatewayTxnId: 'TRX1', paidAt: NOW }),
    );
    expect(orders.markOrderPaid).toHaveBeenCalledWith('ord_1', 'pay_1');
  });

  it('should be idempotent: a duplicate gateway reference is ignored, no double-credit', async () => {
    recon.hasProcessed.mockResolvedValue(true);
    payRepo.findOne.mockResolvedValue(buildPayment({ status: PaymentStatus.PAID }));
    const result = await service.finalize(
      { paymentId: 'pay_1', outcome: 'paid', gatewayReference: 'BKH99X2', event: PaymentLogEvent.EXECUTE },
      NOW,
    );
    expect(result.duplicate).toBe(true);
    expect(recon.recordTxn).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'duplicate_ignored' }),
    );
    expect(orders.markOrderPaid).not.toHaveBeenCalled();
  });

  it('should flag a mismatch and NOT mark paid when the validated amount differs', async () => {
    lockReturns(buildPayment({ amount: '12241.20' }));
    const result = await service.finalize(
      {
        paymentId: 'pay_1',
        outcome: 'paid',
        gatewayReference: 'BKH99X2',
        validatedAmount: '5000.00',
        event: PaymentLogEvent.VALIDATE,
      },
      NOW,
    );
    expect(result.mismatch).toBe(true);
    expect(result.status).not.toBe(PaymentStatus.PAID);
    expect(orders.markOrderPaid).not.toHaveBeenCalled();
  });

  it('should be a no-op when the payment is already final (replay after first apply)', async () => {
    lockReturns(buildPayment({ status: PaymentStatus.PAID }));
    const result = await service.finalize(
      { paymentId: 'pay_1', outcome: 'paid', gatewayReference: 'NEW-REF', validatedAmount: '12241.20', event: PaymentLogEvent.EXECUTE },
      NOW,
    );
    expect(result.duplicate).toBe(true);
    expect(payRepo.save).not.toHaveBeenCalled();
  });

  it('should mark failed and notify the order on a failed outcome (order stays for retry)', async () => {
    lockReturns(buildPayment());
    const result = await service.finalize(
      { paymentId: 'pay_1', outcome: 'failed', gatewayReference: 'F-REF', event: PaymentLogEvent.IPN },
      NOW,
    );
    expect(result.status).toBe(PaymentStatus.FAILED);
    expect(orders.markOrderPaymentFailed).toHaveBeenCalledWith('ord_1');
  });
});
