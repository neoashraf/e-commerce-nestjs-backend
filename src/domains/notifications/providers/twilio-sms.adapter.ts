import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { computeSmsEncoding } from '../notification-render.util';
import { ISmsProvider, SmsSendError, SmsSendResult } from './sms-provider.interface';

/** BD mobile in E.164 (`+8801[3-9]XXXXXXXX`). International is a permanent failure (FR-NOTIF-020). */
const BD_MOBILE = /^\+8801[3-9]\d{8}$/;
const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

/** Mask the middle of a MSISDN for logs (never log the full number). */
function maskMsisdn(to: string): string {
  return to.length > 8 ? `${to.slice(0, 6)}*****${to.slice(-3)}` : to;
}

interface TwilioMessageResponse {
  sid?: string;
  status?: string;
  num_segments?: string;
  error_code?: number;
  error_message?: string;
}

/**
 * Live SMS adapter over Twilio's REST Messages API (FR-NOTIF-020/022/024). Sends via
 * the non-masking transactional sender — a verified `TWILIO_FROM` number, or a
 * `TWILIO_MESSAGING_SERVICE_SID` (Twilio picks the sender). Validates BD mobile,
 * rejects international as a PERMANENT failure, computes sms_segments, and returns
 * Twilio's message SID as the provider_message_ref. HTTP 4xx (bad number/auth/body)
 * is permanent (no retry, FR-NOTIF-043); 5xx / network errors are transient.
 *
 * Uses HTTP Basic auth + fetch (no SDK dependency). Selected over the dev stub by the
 * NotificationsModule factory only when the Twilio credentials are configured.
 */
@Injectable()
export class TwilioSmsAdapter implements ISmsProvider {
  private readonly logger = new Logger(TwilioSmsAdapter.name);
  private readonly accountSid: string;
  private readonly authToken: string;
  /** Either an E.164 sender number (From) or a Messaging Service SID. */
  private readonly sender: string;
  private readonly usesMessagingService: boolean;

  constructor(config: ConfigService) {
    this.accountSid = config.get<string>('TWILIO_ACCOUNT_SID') ?? '';
    this.authToken = config.get<string>('TWILIO_AUTH_TOKEN') ?? '';
    const from = (config.get<string>('TWILIO_FROM') ?? '').trim();
    const messagingServiceSid = (config.get<string>('TWILIO_MESSAGING_SERVICE_SID') ?? '').trim();
    this.usesMessagingService = !from && !!messagingServiceSid;
    this.sender = from || messagingServiceSid;
  }

  /** True once the account SID, auth token, and a sender (From or Messaging Service) are all set. */
  static isConfigured(config: ConfigService): boolean {
    const hasSender =
      !!(config.get<string>('TWILIO_FROM') ?? '').trim() ||
      !!(config.get<string>('TWILIO_MESSAGING_SERVICE_SID') ?? '').trim();
    return (
      !!(config.get<string>('TWILIO_ACCOUNT_SID') ?? '').trim() &&
      !!(config.get<string>('TWILIO_AUTH_TOKEN') ?? '').trim() &&
      hasSender
    );
  }

  async send(to: string, body: string): Promise<SmsSendResult> {
    // FR-NOTIF-020: transactional route serves BD mobiles only.
    if (!BD_MOBILE.test(to)) {
      throw new SmsSendError('International numbers are not permitted.', true, 'INVALID_RECIPIENT');
    }

    const { encoding, segments } = computeSmsEncoding(body);

    const form = new URLSearchParams();
    form.set('To', to);
    // FR-NOTIF-022: non-masking transactional sender.
    if (this.usesMessagingService) form.set('MessagingServiceSid', this.sender);
    else form.set('From', this.sender);
    form.set('Body', body);

    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

    let res: Response;
    try {
      res = await fetch(`${TWILIO_API_BASE}/Accounts/${this.accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          authorization: `Basic ${auth}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });
    } catch (err) {
      // Network / DNS / abort → transient; the dispatcher may retry (FR-NOTIF-043).
      throw new SmsSendError(
        `Twilio request failed: ${(err as Error).message}`,
        false,
        'SMS_GATEWAY_UNREACHABLE',
      );
    }

    const payload = (await res.json().catch(() => ({}))) as TwilioMessageResponse;

    if (!res.ok) {
      // 4xx → permanent (invalid recipient/auth/body); 5xx → transient (retry).
      const permanent = res.status >= 400 && res.status < 500;
      const message = payload.error_message ?? `Twilio responded ${res.status}`;
      const code = payload.error_code ? `TWILIO_${payload.error_code}` : `TWILIO_HTTP_${res.status}`;
      this.logger.warn(`Twilio send failed for ${maskMsisdn(to)}: ${message} (${code})`);
      throw new SmsSendError(message, permanent, code);
    }

    const messageRef = payload.sid ?? `TWILIO-${Date.now()}`;
    // Prefer Twilio's own segment count; fall back to the local estimate (FR-NOTIF-021).
    const segCount = payload.num_segments ? Math.max(1, Number(payload.num_segments)) : segments;
    this.logger.log(`Twilio SMS accepted for ${maskMsisdn(to)} (${segCount} seg, ${encoding}) sid=${messageRef}`);
    return { messageRef, segments: segCount, encoding };
  }
}
