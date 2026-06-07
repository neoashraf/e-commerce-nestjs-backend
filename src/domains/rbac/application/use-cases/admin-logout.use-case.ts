import { Inject, Injectable } from '@nestjs/common';

import {
  ADMIN_SESSION_REPOSITORY,
  IAdminSessionRepository,
} from '../../domain/repositories/admin-session.repository.interface';
import { ADMIN_TOKEN_SERVICE, IAdminTokenService } from '../ports/admin-token-service.port';

export interface AdminLogoutCommand {
  refreshToken: string;
}

/** Revokes the current admin session (FR-RBAC-005). Idempotent — unknown token is a no-op. */
@Injectable()
export class AdminLogoutUseCase {
  constructor(
    @Inject(ADMIN_SESSION_REPOSITORY) private readonly sessions: IAdminSessionRepository,
    @Inject(ADMIN_TOKEN_SERVICE) private readonly tokens: IAdminTokenService,
  ) {}

  async execute(command: AdminLogoutCommand): Promise<void> {
    const hash = this.tokens.hashRefreshToken(command.refreshToken);
    const session = await this.sessions.findByRefreshTokenHash(hash);
    if (session && !session.isRevoked()) {
      session.revoke(new Date());
      await this.sessions.save(session);
    }
  }
}
