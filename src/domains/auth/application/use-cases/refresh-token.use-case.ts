import { randomUUID } from 'crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import { Session } from '../../domain/entities/session.entity';
import {
  ISessionRepository,
  SESSION_REPOSITORY,
} from '../../domain/repositories/session.repository.interface';
import { ITokenService, TOKEN_SERVICE } from '../ports/token-service.port';

export interface RefreshTokenCommand {
  refreshToken: string;
}

export interface RefreshTokenResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class RefreshTokenUseCase {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: ISessionRepository,
    @Inject(TOKEN_SERVICE) private readonly tokens: ITokenService,
  ) {}

  async execute(command: RefreshTokenCommand): Promise<RefreshTokenResult> {
    const now = new Date();
    const hash = this.tokens.hashRefreshToken(command.refreshToken);
    const session = await this.sessions.findByRefreshTokenHash(hash);

    if (!session) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid refresh token.',
      });
    }

    // Reuse of an already-rotated/revoked token → treat as compromised, revoke all (FR-AUTH-016).
    if (session.isRevoked()) {
      await this.sessions.revokeAllForCustomer(session.customerId, now);
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_REUSED',
        message: 'Refresh token reuse detected. Please log in again.',
      });
    }

    if (!session.isActive(now)) {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_EXPIRED',
        message: 'Refresh token expired.',
      });
    }

    // Rotate: revoke the presented session, issue a new one (FR-AUTH-013).
    session.revoke(now);
    await this.sessions.save(session);

    const access = await this.tokens.signAccessToken(session.customerId);
    const refresh = this.tokens.mintRefreshToken(now);
    await this.sessions.save(
      Session.issue(randomUUID(), session.customerId, refresh.hash, refresh.expiresAt, now),
    );

    return {
      accessToken: access.token,
      refreshToken: refresh.raw,
      expiresIn: access.expiresIn,
    };
  }
}
