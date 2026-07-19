import { createHash, randomBytes } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { AUTH_CONFIG, AuthConfig } from '../../application/ports/auth-config.port';
import {
  ITokenService,
  MintedRefreshToken,
  SignAccessTokenOptions,
  SignedAccessToken,
} from '../../application/ports/token-service.port';

@Injectable()
export class JwtTokenService implements ITokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async signAccessToken(
    customerId: string,
    sessionId: string,
    options?: SignAccessTokenOptions,
  ): Promise<SignedAccessToken> {
    const token = await this.jwt.signAsync(
      {
        sub: customerId,
        aud: 'customer',
        sid: sessionId,
        // FR-MFA-018: mark 2FA-verified sessions so disable gating is decidable.
        ...(options?.mfaVerified ? { mfa: true } : {}),
      },
      { expiresIn: this.config.accessTtlSeconds },
    );
    return { token, expiresIn: this.config.accessTtlSeconds };
  }

  mintRefreshToken(now: Date): MintedRefreshToken {
    const raw = randomBytes(48).toString('hex');
    return {
      raw,
      hash: this.hashRefreshToken(raw),
      expiresAt: new Date(now.getTime() + this.config.refreshTtlSeconds * 1000),
    };
  }

  hashRefreshToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
