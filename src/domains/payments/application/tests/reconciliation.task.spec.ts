import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';

import { PaymentMethod, PaymentStatus } from '../../domain/payment-enums';
import { PaymentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/payment.orm-entity';
import { BkashAdapter } from '../providers/bkash.adapter';
import { SslcommerzAdapter } from '../providers/sslcommerz.adapter';
import { GatewayFinalizerService } from '../services/gateway-finalizer.service';
import { ReconciliationTask } from '../services/reconciliation.task';

/** Build a ReconciliationTask over fully-mocked collaborators. */
function makeTask(stale: Array<Partial<PaymentOrmEntity>>) {
  const payments = { find: jest.fn().mockResolvedValue(stale) };
  const finalizer = { finalize: jest.fn().mockResolvedValue({ status: PaymentStatus.PAID }) };
  const bkash = { query: jest.fn() };
  const sslcommerz = { query: jest.fn() };
  const config = {
    get: (k: string) =>
      ({ PAYMENT_RECONCILE_GRACE_MS: '0', PAYMENT_RECONCILE_SWEEP_MS: '0' })[k],
  };

  const task = new ReconciliationTask(
    payments as unknown as Repository<PaymentOrmEntity>,
    finalizer as unknown as GatewayFinalizerService,
    bkash as unknown as BkashAdapter,
    sslcommerz as unknown as SslcommerzAdapter,
    config as unknown as ConfigService,
  );
  return { task, payments, finalizer, bkash, sslcommerz };
}

describe('Payments — ReconciliationTask', () => {
  const now = new Date('2026-06-09T11:00:00.000Z');

  it('should query SSLCommerz by tran_id (internal_ref), NOT the session key, and finalize paid', async () => {
    const { task, sslcommerz, finalizer } = makeTask([
      {
        id: 'pay-1',
        method: PaymentMethod.SSLCOMMERZ,
        internalRef: 'PAY-1',
        gatewayPaymentId: 'SESSIONKEY-XYZ',
      },
    ]);
    sslcommerz.query.mockResolvedValue({ status: 'paid', amount: '100.00', gatewayTxnId: 'BANK1' });

    const finalized = await task.runSweep(now);

    // The fix: query by tran_id (internal_ref), never the session key.
    expect(sslcommerz.query).toHaveBeenCalledWith('PAY-1');
    expect(finalizer.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: 'pay-1',
        outcome: 'paid',
        gatewayReference: 'recon:PAY-1',
        validatedAmount: '100.00',
      }),
    );
    expect(finalized).toBe(1);
  });

  it('should NOT finalize a payment the gateway still reports pending', async () => {
    const { task, sslcommerz, finalizer } = makeTask([
      { id: 'pay-2', method: PaymentMethod.SSLCOMMERZ, internalRef: 'PAY-2', gatewayPaymentId: null },
    ]);
    sslcommerz.query.mockResolvedValue({ status: 'pending' });

    const finalized = await task.runSweep(now);

    expect(finalizer.finalize).not.toHaveBeenCalled();
    expect(finalized).toBe(0);
  });

  it('should query bKash by its paymentID (gatewayPaymentId)', async () => {
    const { task, bkash, sslcommerz } = makeTask([
      { id: 'pay-3', method: PaymentMethod.BKASH, internalRef: 'PAY-3', gatewayPaymentId: 'BK-PAYID' },
    ]);
    bkash.query.mockResolvedValue({ status: 'failed' });

    await task.runSweep(now);

    expect(bkash.query).toHaveBeenCalledWith('BK-PAYID');
    expect(sslcommerz.query).not.toHaveBeenCalled();
  });

  it('should skip COD payments entirely', async () => {
    const { task, bkash, sslcommerz, finalizer } = makeTask([
      { id: 'pay-4', method: PaymentMethod.COD, internalRef: 'PAY-4', gatewayPaymentId: null },
    ]);

    await task.runSweep(now);

    expect(bkash.query).not.toHaveBeenCalled();
    expect(sslcommerz.query).not.toHaveBeenCalled();
    expect(finalizer.finalize).not.toHaveBeenCalled();
  });
});
