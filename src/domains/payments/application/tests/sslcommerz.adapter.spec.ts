import { ConfigService } from '@nestjs/config';

import { SslcommerzAdapter } from '../providers/sslcommerz.adapter';
import { CreateSessionInput } from '../providers/payment-provider.interface';

/** Minimal ConfigService stub returning the given env map. */
function makeConfig(over: Record<string, string | undefined> = {}): ConfigService {
  const env: Record<string, string | undefined> = {
    SSLCOMMERZ_STORE_ID: 'sid',
    SSLCOMMERZ_STORE_PASSWORD: 'spwd',
    SSLCOMMERZ_IS_SANDBOX: 'true',
    PUBLIC_BASE_URL: 'http://localhost:8000',
    ...over,
  };
  return { get: (k: string) => env[k] } as unknown as ConfigService;
}

const INPUT: CreateSessionInput = {
  paymentId: 'p1',
  internalRef: 'PAY-1',
  orderId: 'o1',
  orderNo: 'SO-1',
  amount: '100.00',
  currency: 'BDT',
};

describe('Payments — SslcommerzAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should POST the v4 session endpoint and return the GatewayPageURL when status is SUCCESS', async () => {
    const adapter = new SslcommerzAdapter(makeConfig());
    const fetchMock = jest.fn().mockResolvedValue({
      json: async () => ({
        status: 'SUCCESS',
        sessionkey: 'KEY1',
        GatewayPageURL: 'https://sandbox.sslcommerz.com/EasyCheckOut/KEY1',
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await adapter.createSession(INPUT);

    expect(res.action).toBe('redirect');
    expect(res.redirectUrl).toContain('KEY1');
    expect(res.gatewayPaymentId).toBe('KEY1');
    expect(fetchMock.mock.calls[0][0]).toContain('/gwprocess/v4/api.php');
    // tran_id == internal_ref and ipn_url points at the public webhook path.
    const body = String(fetchMock.mock.calls[0][1].body);
    expect(body).toContain('tran_id=PAY-1');
    expect(decodeURIComponent(body)).toContain('/api/v1/webhooks/payments/sslcommerz/ipn');
  });

  it('should throw when the gateway responds FAILED', async () => {
    const adapter = new SslcommerzAdapter(makeConfig());
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ status: 'FAILED', failedreason: 'Invalid store credential' }),
    }) as unknown as typeof fetch;

    await expect(adapter.createSession(INPUT)).rejects.toThrow(/Invalid store credential/i);
  });

  it('should map a VALID validation to paid with amount + bank_tran_id', async () => {
    const adapter = new SslcommerzAdapter(makeConfig());
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ status: 'VALID', amount: '100.00', bank_tran_id: 'BANK1' }),
    }) as unknown as typeof fetch;

    await expect(adapter.validateIpn('val1')).resolves.toEqual({
      status: 'paid',
      amount: '100.00',
      gatewayTxnId: 'BANK1',
    });
  });

  it('should map a non-VALID validation to failed', async () => {
    const adapter = new SslcommerzAdapter(makeConfig());
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ status: 'INVALID_TRANSACTION' }),
    }) as unknown as typeof fetch;

    await expect(adapter.validateIpn('val1')).resolves.toEqual({ status: 'failed' });
  });

  it('should fall back to a stub session (no external call) when store creds are missing', async () => {
    const adapter = new SslcommerzAdapter(
      makeConfig({ SSLCOMMERZ_STORE_ID: '', SSLCOMMERZ_STORE_PASSWORD: '' }),
    );
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await adapter.createSession(INPUT);

    expect(res.action).toBe('redirect');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
