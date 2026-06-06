import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { NotificationChannel } from './notification.enums';

/**
 * Provider-webhook signature verification (FR-NOTIF-041, §14): the SMS DLR and email-event
 * callbacks are public but must be authenticated by the provider's shared secret. Each channel
 * has a configured secret (`NOTIF_SMS_WEBHOOK_SECRET` / `NOTIF_EMAIL_WEBHOOK_SECRET`); the
 * provider signs the raw request body with HMAC-SHA256 and sends the hex digest in the
 * `x-webhook-signature` header (an optional `sha256=` prefix is tolerated).
 *
 * When no secret is configured for a channel (local/dev), verification is skipped with a warning
 * so the dispatch flow keeps working; configure the secret to enforce rejection in production.
 * The real provider scheme plugs in here at integration without touching the controller.
 */
@Injectable()
export class WebhookVerificationService {
  private readonly logger = new Logger(WebhookVerificationService.name);

  constructor(private readonly config: ConfigService) {}

  private secretFor(channel: NotificationChannel): string | undefined {
    const key = channel === NotificationChannel.SMS ? 'NOTIF_SMS_WEBHOOK_SECRET' : 'NOTIF_EMAIL_WEBHOOK_SECRET';
    const value = this.config.get<string>(key);
    return value && value.trim() ? value : undefined;
  }

  /**
   * Verify the request, or throw `401`. `rawBody` is the exact bytes the provider signed.
   * Throws when a secret is configured but the signature is missing or does not match.
   */
  verify(channel: NotificationChannel, rawBody: Buffer | undefined, signature: string | undefined): void {
    const secret = this.secretFor(channel);
    if (!secret) {
      this.logger.warn(
        `No webhook secret configured for ${channel}; skipping signature verification (set NOTIF_${channel.toUpperCase()}_WEBHOOK_SECRET to enforce).`,
      );
      return;
    }
    if (!signature) {
      throw new UnauthorizedException({ code: 'WEBHOOK_UNVERIFIED', message: 'Missing webhook signature.' });
    }
    const provided = signature.startsWith('sha256=') ? signature.slice('sha256='.length) : signature;
    const expected = createHmac('sha256', secret).update(rawBody ?? Buffer.alloc(0)).digest('hex');
    if (!this.safeEqualHex(provided, expected)) {
      throw new UnauthorizedException({ code: 'WEBHOOK_UNVERIFIED', message: 'Invalid webhook signature.' });
    }
  }

  /** Constant-time hex comparison; unequal lengths fail without leaking timing. */
  private safeEqualHex(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length === 0 || bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
