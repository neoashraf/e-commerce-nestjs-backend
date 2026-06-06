import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CachedToken {
  idToken: string;
  refreshToken: string;
  idExpiresAt: number;
}

/**
 * bKash grant/refresh token cache (FR-PAY-020). The id_token (~1h) is cached and reused; before expiry
 * it is refreshed with the refresh_token (~28d); an invalid refresh forces a fresh grant. In sandbox/
 * unconfigured environments a deterministic stub token is returned so flows are exercisable without live
 * credentials (swap the grant/refresh HTTP calls for the real bKash endpoints at live-credential time).
 */
@Injectable()
export class BkashTokenService {
  private readonly logger = new Logger(BkashTokenService.name);
  private cache: CachedToken | null = null;
  private readonly idTtlMs: number;

  constructor(private readonly config: ConfigService) {
    this.idTtlMs = Number(config.get('BKASH_ID_TOKEN_TTL_MS') ?? 55 * 60 * 1000);
  }

  /** Return a valid id_token, refreshing/granting as needed. */
  async getIdToken(now: number = Date.now()): Promise<string> {
    if (this.cache && this.cache.idExpiresAt > now) {
      return this.cache.idToken;
    }
    if (this.cache) {
      try {
        this.cache = await this.refresh(this.cache.refreshToken, now);
        return this.cache.idToken;
      } catch (err) {
        this.logger.warn(`bKash token refresh failed (${(err as Error).message}); re-granting.`);
      }
    }
    this.cache = await this.grant(now);
    return this.cache.idToken;
  }

  /** Force-invalidate the cached token (e.g. on a 401 from bKash). */
  invalidate(): void {
    this.cache = null;
  }

  // --- grant / refresh (sandbox stub until live bKash credentials are wired) ---

  private async grant(now: number): Promise<CachedToken> {
    // Live: POST {base}/tokenized/checkout/token/grant with app key/secret + username/password.
    this.logger.log('[sandbox] bKash grant-token');
    return {
      idToken: `bkash-id-${now}`,
      refreshToken: `bkash-refresh-${now}`,
      idExpiresAt: now + this.idTtlMs,
    };
  }

  private async refresh(refreshToken: string, now: number): Promise<CachedToken> {
    // Live: POST {base}/tokenized/checkout/token/refresh with the refresh_token.
    this.logger.log('[sandbox] bKash refresh-token');
    return {
      idToken: `bkash-id-${now}`,
      refreshToken,
      idExpiresAt: now + this.idTtlMs,
    };
  }
}
