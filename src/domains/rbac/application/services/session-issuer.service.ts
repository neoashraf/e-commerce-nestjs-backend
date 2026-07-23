import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';

import { AdminSession } from '../../domain/entities/admin-session.entity';
import {
  ADMIN_SESSION_REPOSITORY,
  IAdminSessionRepository,
} from '../../domain/repositories/admin-session.repository.interface';
import { ADMIN_TOKEN_SERVICE, IAdminTokenService } from '../ports/admin-token-service.port';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** Mints an admin access token + persists a new refresh session. Shared by login/2fa/refresh. */
@Injectable()
export class SessionIssuerService {
  constructor(
    @Inject(ADMIN_SESSION_REPOSITORY) private readonly sessions: IAdminSessionRepository,
    @Inject(ADMIN_TOKEN_SERVICE) private readonly tokens: IAdminTokenService,
  ) {}

  /**
   * Fresh login session (remember → 90d, else 30d refresh TTL). `mfaVerified` marks a
   * login that passed the 2FA step (FR-RBAC-009, mirrors FR-MFA-018).
   */
  async issueForLogin(
    adminId: string,
    roleId: string,
    remember: boolean,
    deviceLabel: string | null,
    now: Date,
    mfaVerified = false,
  ): Promise<IssuedTokens> {
    const refresh = this.tokens.mintRefreshToken(now, remember);
    return this.persist(adminId, roleId, refresh.raw, refresh.hash, refresh.expiresAt, deviceLabel, now, mfaVerified);
  }

  /** Rotated session — carries the original session's expiry ceiling (no extend on rotation). */
  async issueForRotation(
    adminId: string,
    roleId: string,
    expiresAt: Date,
    deviceLabel: string | null,
    now: Date,
    mfaVerified = false,
  ): Promise<IssuedTokens> {
    const refresh = this.tokens.mintRefreshToken(now, false);
    return this.persist(adminId, roleId, refresh.raw, refresh.hash, expiresAt, deviceLabel, now, mfaVerified);
  }

  private async persist(
    adminId: string,
    roleId: string,
    rawRefresh: string,
    refreshHash: string,
    expiresAt: Date,
    deviceLabel: string | null,
    now: Date,
    mfaVerified: boolean,
  ): Promise<IssuedTokens> {
    const sessionId = randomUUID();
    const access = await this.tokens.signAccessToken(adminId, roleId, {
      sessionId,
      mfaVerified,
    });
    // device_label is a varchar(255) sourced from the User-Agent header; cap it so an
    // unusually long UA can never overflow the column and 500 the login/verify/refresh flow.
    const label = deviceLabel != null ? deviceLabel.slice(0, 255) : null;
    await this.sessions.save(
      AdminSession.issue(sessionId, adminId, refreshHash, expiresAt, now, label, mfaVerified),
    );
    return { accessToken: access.token, refreshToken: rawRefresh, expiresIn: access.expiresIn };
  }
}
