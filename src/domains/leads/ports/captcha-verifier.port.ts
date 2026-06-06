import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Spam protection port (FR-LEAD-006). Verifies the CAPTCHA token submitted with a public lead. The
 * provider is pluggable (reCAPTCHA / hCaptcha / Turnstile) — see PR open question. Disabled by default
 * (`LEAD_CAPTCHA_ENABLED=false`) so local/dev submission works; when enabled the stub requires a
 * non-empty token. Honeypot + per-IP rate-limiting are enforced separately in the service/controller.
 */
export interface ICaptchaVerifier {
  /** Resolves true when the token is acceptable (or verification is disabled). */
  verify(token: string | null): Promise<boolean>;
}

export const CAPTCHA_VERIFIER = Symbol('ICaptchaVerifier');

@Injectable()
export class ConfigCaptchaVerifier implements ICaptchaVerifier {
  private readonly logger = new Logger(ConfigCaptchaVerifier.name);

  constructor(private readonly config: ConfigService) {}

  verify(token: string | null): Promise<boolean> {
    const enabled = this.config.get<string>('LEAD_CAPTCHA_ENABLED', 'false') === 'true';
    if (!enabled) return Promise.resolve(true);
    // Pluggable provider check goes here; the stub accepts any non-empty token.
    const ok = typeof token === 'string' && token.trim().length > 0;
    if (!ok) this.logger.warn('CAPTCHA verification failed (missing/empty token)');
    return Promise.resolve(ok);
  }
}
