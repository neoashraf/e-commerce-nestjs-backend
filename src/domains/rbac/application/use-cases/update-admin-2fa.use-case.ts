import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AuditResult } from '../../domain/enums/audit-result.enum';
import { TwofaPurpose } from '../../domain/enums/twofa-purpose.enum';
import {
  ADMIN_USER_REPOSITORY,
  IAdminUserRepository,
} from '../../domain/repositories/admin-user.repository.interface';
import {
  ADMIN_SESSION_REPOSITORY,
  IAdminSessionRepository,
} from '../../domain/repositories/admin-session.repository.interface';
import {
  ITwofaChallengeRepository,
  TWOFA_CHALLENGE_REPOSITORY,
} from '../../domain/repositories/twofa-challenge.repository.interface';
import {
  ADMIN_NOTIFICATION_DISPATCHER,
  IAdminNotificationDispatcher,
} from '../ports/admin-notification.port';
import { ADMIN_OTP_SERVICE, IAdminOtpService } from '../ports/admin-otp.port';
import { IPasswordHasher, PASSWORD_HASHER } from '../ports/password-hasher.port';
import { RBAC_CONFIG, RbacConfig } from '../ports/rbac-config.port';
import { AuditService } from '../services/audit.service';
import {
  IssuedTwofaChallenge,
  TwofaChallengeIssuerService,
} from '../services/twofa-challenge-issuer.service';

export interface UpdateAdmin2faCommand {
  adminId: string;
  enabled: boolean;
  currentPassword: string;
  /** Disable path: fresh emailed code (waived for 2FA-verified sessions, FR-RBAC-009). */
  code?: string;
  /** From the access token's `mfa` claim (login passed the 2FA step). */
  sessionMfaVerified: boolean;
  /** The session (`sid`) making the request — spared by the revoke sweep. */
  currentSessionId?: string;
  ipAddress?: string | null;
}

export interface Update2faResult {
  twofaEnabled: boolean;
  /** Present when a code was just sent (enable start, or disable needing a code). */
  verification?: IssuedTwofaChallenge;
}

/**
 * Admin 2FA toggle, two-step (FR-RBAC-008/009, v0.2). Enable: password → emailed code
 * (activation happens in ConfirmAdmin2faUseCase). Disable: password always; plus a fresh
 * emailed code when the session did not itself pass the 2FA step — calling without the
 * code returns a `verification` challenge instead of disabling. Email-only (2026-07-18);
 * available to every admin including Super Admin (2026-07-14 — no forced-on role).
 */
@Injectable()
export class UpdateAdmin2faUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: IAdminUserRepository,
    @Inject(ADMIN_SESSION_REPOSITORY) private readonly sessions: IAdminSessionRepository,
    @Inject(TWOFA_CHALLENGE_REPOSITORY) private readonly challenges: ITwofaChallengeRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(ADMIN_OTP_SERVICE) private readonly otp: IAdminOtpService,
    @Inject(ADMIN_NOTIFICATION_DISPATCHER)
    private readonly notifier: IAdminNotificationDispatcher,
    @Inject(RBAC_CONFIG) private readonly config: RbacConfig,
    private readonly issuer: TwofaChallengeIssuerService,
    private readonly audit: AuditService,
  ) {}

  async execute(command: UpdateAdmin2faCommand): Promise<Update2faResult> {
    const now = new Date();
    const admin = await this.admins.findById(command.adminId);
    if (!admin || !admin.passwordHash) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' });
    }
    const ok = await this.hasher.compare(command.currentPassword, admin.passwordHash);
    if (!ok) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' });
    }

    if (command.enabled) {
      // Enable step 1 (FR-RBAC-008): send the emailed code; 2FA is NOT active yet.
      const verification = await this.issuer.issue(admin, TwofaPurpose.ENABLE, now);
      return { twofaEnabled: admin.twofaEnabled, verification };
    }

    // Disable (FR-RBAC-009).
    if (!admin.twofaEnabled) {
      throw new BadRequestException({
        code: 'TWOFA_NOT_ENABLED',
        message: 'Two-factor authentication is not enabled.',
      });
    }

    if (!command.sessionMfaVerified) {
      if (!command.code) {
        // No code yet: send one and hand back the challenge (enable-shaped response).
        const verification = await this.issuer.issue(admin, TwofaPurpose.DISABLE, now);
        return { twofaEnabled: true, verification };
      }
      await this.verifyDisableCode(admin.id, command.code, now);
    }

    admin.disableTwofa(now);
    await this.admins.save(admin);

    // FR-RBAC-009: revoke every other admin session (current survives), notify, audit.
    await this.sessions.revokeAllForAdminExcept(admin.id, command.currentSessionId ?? null, now);
    await this.notifier.dispatchTwofaStateChange({
      email: admin.email,
      fullName: admin.fullName,
      enabled: false,
    });
    await this.audit.record({
      actorAdminId: admin.id,
      action: 'admin.2fa.disable',
      result: AuditResult.SUCCESS,
      entityType: 'AdminUser',
      entityId: admin.id,
      summary: { before: { two_fa_enabled: true }, after: { two_fa_enabled: false } },
      ipAddress: command.ipAddress ?? null,
    });

    return { twofaEnabled: false };
  }

  /** Verify the fresh disable code against the latest `disable` challenge (FR-RBAC-009). */
  private async verifyDisableCode(adminId: string, code: string, now: Date): Promise<void> {
    const challenge = await this.challenges.findLatestByAdminAndPurpose(
      adminId,
      TwofaPurpose.DISABLE,
    );
    if (
      !challenge ||
      challenge.isConsumed() ||
      challenge.isExpired(now) ||
      challenge.attemptsExhausted(this.config.twofaAttemptCap)
    ) {
      throw new BadRequestException({ code: 'INVALID_2FA_CODE', message: 'Invalid or expired code.' });
    }
    const matches = await this.otp.compare(code, challenge.otpHash);
    if (!matches) {
      challenge.registerFailedAttempt();
      await this.challenges.save(challenge);
      throw new BadRequestException({ code: 'INVALID_2FA_CODE', message: 'Invalid or expired code.' });
    }
    challenge.consume(now);
    await this.challenges.save(challenge);
  }
}
