import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ICaptchaVerifier } from '../ports/captcha-verifier.port';

/**
 * Cloudflare Turnstile CAPTCHA verifier (FR-LEAD-006). POSTs the client token + secret to
 * Turnstile's `siteverify` and passes only when `success === true`.
 *
 * - Disabled (`LEAD_CAPTCHA_ENABLED` ≠ `true`) → bypass (dev), matching the stub.
 * - Enabled with a missing/empty token, a missing secret, a non-2xx response, or any
 *   network/timeout error → **fail-closed** (reject, never crash) so spam can't slip through
 *   on a transport hiccup (§12.1, brief AC2).
 */
@Injectable()
export class TurnstileCaptchaVerifier implements ICaptchaVerifier {
  private readonly logger = new Logger(TurnstileCaptchaVerifier.name);
  private readonly endpoint = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
  private readonly timeoutMs = 5000;

  constructor(private readonly config: ConfigService) {}

  async verify(token: string | null): Promise<boolean> {
    const enabled = this.config.get<string>('LEAD_CAPTCHA_ENABLED', 'false') === 'true';
    if (!enabled) return true; // dev bypass

    if (typeof token !== 'string' || token.trim().length === 0) {
      this.logger.warn('CAPTCHA verification failed (missing/empty token)');
      return false;
    }

    const secret = this.config.get<string>('TURNSTILE_SECRET_KEY');
    if (!secret) {
      this.logger.error('TURNSTILE_SECRET_KEY is not configured; rejecting (fail-closed).');
      return false;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const form = new URLSearchParams();
      form.set('secret', secret);
      form.set('response', token);

      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        signal: controller.signal,
      });

      if (!res.ok) {
        this.logger.warn(`Turnstile siteverify returned HTTP ${res.status}; treating as failure.`);
        return false;
      }

      const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
      if (data.success !== true) {
        this.logger.warn(
          `Turnstile rejected the token (${(data['error-codes'] ?? []).join(', ') || 'no error code'}).`,
        );
        return false;
      }
      return true;
    } catch (err) {
      // Network failure / abort (timeout) → fail-closed, never a 500 crash (AC2).
      this.logger.warn(`Turnstile siteverify error (fail-closed): ${(err as Error).message}`);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
