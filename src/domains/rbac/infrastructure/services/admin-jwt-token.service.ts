import { createHash, randomBytes } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { RBAC_CONFIG, RbacConfig } from '../../application/ports/rbac-config.port';
import {
  IAdminTokenService,
  MintedAdminRefreshToken,
  SignAdminAccessTokenOptions,
  SignedAdminAccessToken,
} from '../../application/ports/admin-token-service.port';

/** Admin JWT (`aud: 'admin'`) + opaque refresh tokens (sha256-hashed for storage). */
@Injectable()
export class AdminJwtTokenService implements IAdminTokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(RBAC_CONFIG) private readonly config: RbacConfig,
  ) {}

  async signAccessToken(
    adminId: string,
    roleId: string,
    options?: SignAdminAccessTokenOptions,
  ): Promise<SignedAdminAccessToken> {
    const token = await this.jwt.signAsync(
      {
        sub: adminId,
        aud: 'admin',
        role_id: roleId,
        ...(options?.sessionId ? { sid: options.sessionId } : {}),
        // FR-RBAC-009: mark 2FA-verified sessions so disable gating is decidable.
        ...(options?.mfaVerified ? { mfa: true } : {}),
      },
      { expiresIn: this.config.accessTtlSeconds },
    );
    return { token, expiresIn: this.config.accessTtlSeconds };
  }

  mintRefreshToken(now: Date, remember: boolean): MintedAdminRefreshToken {
    const raw = randomBytes(48).toString('hex');
    const ttl = remember ? this.config.refreshTtlRememberSeconds : this.config.refreshTtlSeconds;
    return {
      raw,
      hash: this.hashRefreshToken(raw),
      expiresAt: new Date(now.getTime() + ttl * 1000),
    };
  }

  hashRefreshToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
