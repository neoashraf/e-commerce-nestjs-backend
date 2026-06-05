import { Inject, Injectable } from '@nestjs/common';

import {
  ISessionRepository,
  SESSION_REPOSITORY,
} from '../../domain/repositories/session.repository.interface';
import { ITokenService, TOKEN_SERVICE } from '../ports/token-service.port';

export interface LogoutCommand {
  refreshToken: string;
}

@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: ISessionRepository,
    @Inject(TOKEN_SERVICE) private readonly tokens: ITokenService,
  ) {}

  /** Revoke the current session's refresh token (FR-AUTH-014). Idempotent. */
  async execute(command: LogoutCommand): Promise<void> {
    const now = new Date();
    const hash = this.tokens.hashRefreshToken(command.refreshToken);
    const session = await this.sessions.findByRefreshTokenHash(hash);
    if (session && session.isActive(now)) {
      session.revoke(now);
      await this.sessions.save(session);
    }
  }
}
