import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';

import { computeSmsEncoding } from '../notification-render.util';
import { ISmsProvider, SmsSendError, SmsSendResult } from './sms-provider.interface';

const BD_MOBILE = /^\+8801[3-9]\d{8}$/;

/**
 * Stub SMS adapter (no live gateway yet) — routes via the non-masking sender (FR-NOTIF-022),
 * validates BD mobile and rejects international as a PERMANENT failure (FR-NOTIF-020),
 * computes sms_segments (FR-NOTIF-021), and returns a stub provider_message_ref (FR-NOTIF-024).
 * Swap for the real SportSBD adapter at integration.
 */
@Injectable()
export class StubSmsAdapter implements ISmsProvider {
  private readonly logger = new Logger(StubSmsAdapter.name);

  async send(to: string, body: string): Promise<SmsSendResult> {
    if (!BD_MOBILE.test(to)) {
      throw new SmsSendError('International numbers are not permitted.', true, 'INVALID_RECIPIENT');
    }
    const { encoding, segments } = computeSmsEncoding(body);
    const messageRef = `SMS-${randomUUID()}`;
    this.logger.warn(`[STUB SMS] non_masking → ${to} (${segments} seg, ${encoding}) ref=${messageRef} :: ${body}`);
    return { messageRef, segments, encoding };
  }
}
