import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import { AuditResult } from '../../domain/enums/audit-result.enum';
import { TwofaChannel } from '../../domain/enums/twofa-channel.enum';
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
import { RBAC_CONFIG, RbacConfig } from '../ports/rbac-config.port';
import { AuditService } from '../services/audit.service';

export interface ConfirmAdmin2faCommand {
  adminId: string;
  challengeId: string;
  code: string;
  currentSessionId?: string;
  ipAddress?: string | null;
}

const INVALID = { code: 'INVALID_2FA_CODE', message: 'Invalid or expired code.' };

/**
 * Step 2 of enabling admin 2FA (FR-RBAC-008): the emailed code proves the channel works;
 * only now does 2FA activate. On success other admin sessions are revoked (current
 * survives), a confirmation is emailed, and the change is audit-logged (FR-RBAC-009).
 */
@Injectable()
export class ConfirmAdmin2faUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: IAdminUserRepository,
    @Inject(ADMIN_SESSION_REPOSITORY) private readonly sessions: IAdminSessionRepository,
    @Inject(TWOFA_CHALLENGE_REPOSITORY) private readonly challenges: ITwofaChallengeRepository,
    @Inject(ADMIN_OTP_SERVICE) private readonly otp: IAdminOtpService,
    @Inject(ADMIN_NOTIFICATION_DISPATCHER)
    private readonly notifier: IAdminNotificationDispatcher,
    @Inject(RBAC_CONFIG) private readonly config: RbacConfig,
    private readonly audit: AuditService,
  ) {}

  async execute(command: ConfirmAdmin2faCommand): Promise<{ twofaEnabled: true }> {
    const now = new Date();
    const admin = await this.admins.findById(command.adminId);
    if (!admin) {
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Invalid token.' });
    }

    const challenge = await this.challenges.findById(command.challengeId);
    if (
      !challenge ||
      challenge.adminUserId !== admin.id ||
      // Purpose binding: only an `enable` challenge can activate 2FA (FR-RBAC-008).
      challenge.purpose !== TwofaPurpose.ENABLE ||
      challenge.isConsumed() ||
      challenge.isExpired(now) ||
      challenge.attemptsExhausted(this.config.twofaAttemptCap)
    ) {
      throw new BadRequestException(INVALID);
    }

    const matches = await this.otp.compare(command.code, challenge.otpHash);
    if (!matches) {
      challenge.registerFailedAttempt();
      await this.challenges.save(challenge);
      throw new BadRequestException(INVALID);
    }

    challenge.consume(now);
    await this.challenges.save(challenge);

    const wasEnabled = admin.twofaEnabled;
    // Email-only (decision 2026-07-18) — the channel field is retired.
    admin.enableTwofa(TwofaChannel.EMAIL, now);
    await this.admins.save(admin);

    // FR-RBAC-009: revoke every other admin session (current survives), notify, audit.
    await this.sessions.revokeAllForAdminExcept(admin.id, command.currentSessionId ?? null, now);
    await this.notifier.dispatchTwofaStateChange({
      email: admin.email,
      fullName: admin.fullName,
      enabled: true,
    });
    await this.audit.record({
      actorAdminId: admin.id,
      action: 'admin.2fa.enable',
      result: AuditResult.SUCCESS,
      entityType: 'AdminUser',
      entityId: admin.id,
      summary: { before: { two_fa_enabled: wasEnabled }, after: { two_fa_enabled: true } },
      ipAddress: command.ipAddress ?? null,
    });

    return { twofaEnabled: true };
  }
}
