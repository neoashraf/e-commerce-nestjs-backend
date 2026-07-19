import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';
import {
  ADMIN_USER_REPOSITORY,
  IAdminUserRepository,
} from '../../domain/repositories/admin-user.repository.interface';
import {
  ADMIN_SESSION_REPOSITORY,
  IAdminSessionRepository,
} from '../../domain/repositories/admin-session.repository.interface';
import { ADMIN_TOKEN_SERVICE, IAdminTokenService } from '../ports/admin-token-service.port';
import { IssuedTokens, SessionIssuerService } from '../services/session-issuer.service';

export interface RefreshAdminTokenCommand {
  refreshToken: string;
  deviceLabel: string | null;
}

@Injectable()
export class RefreshAdminTokenUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: IAdminUserRepository,
    @Inject(ADMIN_SESSION_REPOSITORY) private readonly sessions: IAdminSessionRepository,
    @Inject(ADMIN_TOKEN_SERVICE) private readonly tokens: IAdminTokenService,
    private readonly sessionIssuer: SessionIssuerService,
  ) {}

  async execute(command: RefreshAdminTokenCommand): Promise<IssuedTokens> {
    const now = new Date();
    const hash = this.tokens.hashRefreshToken(command.refreshToken);
    const session = await this.sessions.findByRefreshTokenHash(hash);

    if (!session) {
      throw new UnauthorizedException({ code: 'INVALID_REFRESH_TOKEN', message: 'Invalid refresh token.' });
    }
    // Reuse of an already-rotated/revoked token → treat as compromised, revoke all.
    if (session.isRevoked()) {
      await this.sessions.revokeAllForAdmin(session.adminUserId, now);
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_REUSED',
        message: 'Refresh token reuse detected. Please log in again.',
      });
    }
    if (!session.isActive(now)) {
      throw new UnauthorizedException({ code: 'REFRESH_TOKEN_EXPIRED', message: 'Refresh token expired.' });
    }

    // Suspended/deleted admin cannot refresh (FR-RBAC-013).
    const admin = await this.admins.findById(session.adminUserId);
    if (!admin || admin.status !== AdminUserStatus.ACTIVE) {
      await this.sessions.revokeAllForAdmin(session.adminUserId, now);
      throw new UnauthorizedException({ code: 'INVALID_REFRESH_TOKEN', message: 'Invalid refresh token.' });
    }

    // Rotate: revoke the presented session, issue a new one within the same expiry ceiling.
    session.revoke(now);
    await this.sessions.save(session);
    // Carry the 2FA-verified marker across the rotation — same login lineage (FR-RBAC-009).
    return this.sessionIssuer.issueForRotation(
      admin.id,
      admin.roleId,
      session.expiresAt,
      command.deviceLabel ?? session.deviceLabel,
      now,
      session.mfaVerified,
    );
  }
}
