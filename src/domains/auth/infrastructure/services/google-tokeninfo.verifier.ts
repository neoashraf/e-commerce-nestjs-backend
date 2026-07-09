import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  GoogleProfile,
  IGoogleVerifier,
} from '../../application/ports/google-verifier.port';

const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const VALID_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

/**
 * Real {@link IGoogleVerifier} — validates a Google ID token via Google's official `tokeninfo`
 * endpoint (no extra dependency / client secret needed). Google checks the signature + expiry; we
 * additionally enforce that `aud` equals our `GOOGLE_CLIENT_ID` and `iss` is a Google issuer, so a
 * token minted for another app is rejected. Any network/parse failure or claim mismatch → `401`.
 *
 * NOTE: requires `GOOGLE_CLIENT_ID` to be set; without it sign-in is disabled (`503`).
 */
@Injectable()
export class GoogleTokenInfoVerifier implements IGoogleVerifier {
  constructor(private readonly config: ConfigService) {}

  async verify(idToken: string): Promise<GoogleProfile> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) {
      throw new ServiceUnavailableException({
        code: 'GOOGLE_NOT_CONFIGURED',
        message: 'Google sign-in is not configured.',
      });
    }

    let payload: Record<string, unknown>;
    try {
      const res = await fetch(`${TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`);
      if (!res.ok) throw new Error(`tokeninfo responded ${res.status}`);
      payload = (await res.json()) as Record<string, unknown>;
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_GOOGLE_TOKEN',
        message: 'Could not verify your Google sign-in. Please try again.',
      });
    }

    const aud = typeof payload.aud === 'string' ? payload.aud : '';
    const iss = typeof payload.iss === 'string' ? payload.iss : '';
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';

    // The token must have been issued by Google FOR THIS app — else it's not ours to trust.
    if (aud !== clientId || !VALID_ISSUERS.has(iss) || !email) {
      throw new UnauthorizedException({
        code: 'INVALID_GOOGLE_TOKEN',
        message: 'Invalid Google sign-in.',
      });
    }

    return {
      email,
      emailVerified: payload.email_verified === true || payload.email_verified === 'true',
      name: typeof payload.name === 'string' ? payload.name : null,
      sub: typeof payload.sub === 'string' ? payload.sub : '',
    };
  }
}
