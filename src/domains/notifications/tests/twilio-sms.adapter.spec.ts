import { ConfigService } from '@nestjs/config';

import { SmsSendError } from '../providers/sms-provider.interface';
import { TwilioSmsAdapter } from '../providers/twilio-sms.adapter';

/** Minimal ConfigService stand-in backed by a plain map. */
const cfg = (values: Record<string, string>): ConfigService =>
  ({ get: (k: string) => values[k] }) as unknown as ConfigService;

const FULL = {
  TWILIO_ACCOUNT_SID: 'AC123',
  TWILIO_AUTH_TOKEN: 'tok_secret',
  TWILIO_FROM: '+8801700000000',
};

/** Build a fetch Response-like object. */
const resp = (status: number, body: unknown): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

describe('NOTIF — TwilioSmsAdapter', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('isConfigured', () => {
    it('is true with account SID + auth token + a From number', () => {
      expect(TwilioSmsAdapter.isConfigured(cfg(FULL))).toBe(true);
    });
    it('is true with a Messaging Service SID instead of From', () => {
      expect(
        TwilioSmsAdapter.isConfigured(
          cfg({ TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_MESSAGING_SERVICE_SID: 'MG1' }),
        ),
      ).toBe(true);
    });
    it('is false when a sender is missing', () => {
      expect(TwilioSmsAdapter.isConfigured(cfg({ TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't' }))).toBe(false);
    });
  });

  it('sends a valid BD SMS via Twilio and returns the message SID as the ref', async () => {
    fetchMock.mockResolvedValue(resp(201, { sid: 'SM_abc', status: 'queued', num_segments: '1' }));
    const adapter = new TwilioSmsAdapter(cfg(FULL));

    const result = await adapter.send('+8801712345678', 'Your code is 482913');

    expect(result).toEqual({ messageRef: 'SM_abc', segments: 1, encoding: 'gsm7' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe(`Basic ${Buffer.from('AC123:tok_secret').toString('base64')}`);
    const body = new URLSearchParams(init.body as string);
    expect(body.get('To')).toBe('+8801712345678');
    expect(body.get('From')).toBe('+8801700000000');
    expect(body.get('Body')).toBe('Your code is 482913');
    expect(body.get('MessagingServiceSid')).toBeNull();
  });

  it('uses MessagingServiceSid when no From number is set', async () => {
    fetchMock.mockResolvedValue(resp(201, { sid: 'SM_x' }));
    const adapter = new TwilioSmsAdapter(
      cfg({ TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 't', TWILIO_MESSAGING_SERVICE_SID: 'MG9' }),
    );

    await adapter.send('+8801712345678', 'hi');

    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
    expect(body.get('MessagingServiceSid')).toBe('MG9');
    expect(body.get('From')).toBeNull();
  });

  it('rejects an international number as a PERMANENT failure without calling Twilio (FR-NOTIF-020)', async () => {
    const adapter = new TwilioSmsAdapter(cfg(FULL));

    await expect(adapter.send('+14155550100', 'hi')).rejects.toMatchObject({
      permanent: true,
      code: 'INVALID_RECIPIENT',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a Twilio 4xx error to a PERMANENT SmsSendError with the Twilio code', async () => {
    fetchMock.mockResolvedValue(resp(400, { error_code: 21211, error_message: "Invalid 'To' number" }));
    const adapter = new TwilioSmsAdapter(cfg(FULL));

    const err = await adapter.send('+8801712345678', 'hi').catch((e) => e);
    expect(err).toBeInstanceOf(SmsSendError);
    expect(err.permanent).toBe(true);
    expect(err.code).toBe('TWILIO_21211');
    expect(err.message).toBe("Invalid 'To' number");
  });

  it('maps a Twilio 5xx error to a TRANSIENT SmsSendError (retryable)', async () => {
    fetchMock.mockResolvedValue(resp(503, { error_message: 'Service unavailable' }));
    const adapter = new TwilioSmsAdapter(cfg(FULL));

    const err = await adapter.send('+8801712345678', 'hi').catch((e) => e);
    expect(err).toBeInstanceOf(SmsSendError);
    expect(err.permanent).toBe(false);
  });

  it('treats a network failure as TRANSIENT (unreachable gateway)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    const adapter = new TwilioSmsAdapter(cfg(FULL));

    await expect(adapter.send('+8801712345678', 'hi')).rejects.toMatchObject({
      permanent: false,
      code: 'SMS_GATEWAY_UNREACHABLE',
    });
  });
});
