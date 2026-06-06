import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { WebhookService } from '../services/webhook.service';
import { GatewayFinalizerService } from '../services/gateway-finalizer.service';
import { PaymentsService } from '../services/payments.service';
import { BkashAdapter } from '../providers/bkash.adapter';
import { SslcommerzAdapter } from '../providers/sslcommerz.adapter';
import { PaymentStatus } from '../../domain/payment-enums';

describe('Payments — WebhookService', () => {
  let service: WebhookService;
  let payments: { findByGatewayPaymentId: jest.Mock; findByInternalRef: jest.Mock };
  let finalizer: { finalize: jest.Mock };
  let bkash: { confirm: jest.Mock };
  let sslcommerz: { validateIpn: jest.Mock };

  beforeEach(async () => {
    payments = {
      findByGatewayPaymentId: jest.fn().mockResolvedValue({ id: 'pay_1', orderId: 'ord_1' }),
      findByInternalRef: jest.fn().mockResolvedValue({ id: 'pay_2', orderId: 'ord_2' }),
    };
    finalizer = { finalize: jest.fn().mockResolvedValue({ status: PaymentStatus.PAID }) };
    bkash = { confirm: jest.fn().mockResolvedValue({ status: 'paid', gatewayTxnId: 'TRX', amount: '100.00' }) };
    sslcommerz = { validateIpn: jest.fn().mockResolvedValue({ status: 'paid', amount: '100.00' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: PaymentsService, useValue: payments },
        { provide: GatewayFinalizerService, useValue: finalizer },
        { provide: BkashAdapter, useValue: bkash },
        { provide: SslcommerzAdapter, useValue: sslcommerz },
        { provide: ConfigService, useValue: { get: () => 'http://localhost:3000/checkout/result' } },
      ],
    }).compile();

    service = module.get(WebhookService);
  });

  afterEach(() => jest.clearAllMocks());

  // --- bKash ---

  it('should execute server-side on a bKash success callback and redirect to success', async () => {
    const out = await service.handleBkashCallback('TR0011', 'success');
    expect(bkash.confirm).toHaveBeenCalledWith('TR0011');
    expect(finalizer.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'paid', gatewayReference: 'TR0011', event: 'execute' }),
    );
    expect(out.redirectUrl).toContain('status=success');
  });

  it('should NOT execute when the bKash browser status is not success (advisory)', async () => {
    const out = await service.handleBkashCallback('TR0011', 'cancel');
    expect(bkash.confirm).not.toHaveBeenCalled();
    expect(finalizer.finalize).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'cancelled' }));
    expect(out.redirectUrl).toContain('status=failed');
  });

  // --- SSLCommerz IPN ---

  it('should validate the IPN via the Order Validation API and finalize paid', async () => {
    const result = await service.handleSslcommerzIpn({ tran_id: 'PAY-X', val_id: 'val_1', amount: '100.00', status: 'VALID' });
    expect(sslcommerz.validateIpn).toHaveBeenCalledWith('val_1');
    expect(finalizer.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'paid', validatedAmount: '100.00', event: 'validate' }),
    );
    expect(result).toEqual({ received: true });
  });

  it('should finalize failed on an SSLCommerz FAILED IPN without validating', async () => {
    await service.handleSslcommerzIpn({ tran_id: 'PAY-X', status: 'FAILED' });
    expect(sslcommerz.validateIpn).not.toHaveBeenCalled();
    expect(finalizer.finalize).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed' }));
  });

  it('should always return { received: true } even for an unknown tran_id', async () => {
    payments.findByInternalRef.mockResolvedValue(null);
    const result = await service.handleSslcommerzIpn({ tran_id: 'unknown', val_id: 'v', status: 'VALID' });
    expect(result).toEqual({ received: true });
    expect(finalizer.finalize).not.toHaveBeenCalled();
  });

  // --- advisory returns ---

  it('should never finalize on an advisory browser return', () => {
    const out = service.advisoryRedirect('PAY-X', 'success');
    expect(finalizer.finalize).not.toHaveBeenCalled();
    expect(out.redirectUrl).toContain('status=pending');
  });
});
