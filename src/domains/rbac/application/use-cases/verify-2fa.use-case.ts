import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';
import { AuditResult } from '../../domain/enums/audit-result.enum';
import {
  ADMIN_USER_REPOSITORY,
  IAdminUserRepository,
} from '../../domain/repositories/admin-user.repository.interface';
import { IRoleRepository, ROLE_REPOSITORY } from '../../domain/repositories/role.repository.interface';
import {
  ITwofaChallengeRepository,
  TWOFA_CHALLENGE_REPOSITORY,
} from '../../domain/repositories/twofa-challenge.repository.interface';
import { ADMIN_OTP_SERVICE, IAdminOtpService } from '../ports/admin-otp.port';
import { RBAC_CONFIG, RbacConfig } from '../ports/rbac-config.port';
import { AuditService } from '../services/audit.service';
import { IssuedTokens, SessionIssuerService } from '../services/session-issuer.service';

export interface Verify2faCommand {
  challengeId: string;
  code: string;
  ipAddress: string | null;
  deviceLabel: string | null;
}

export interface Verify2faResult {
  admin: { id: string; roleName: string };
  tokens: IssuedTokens;
}

const INVALID = { code: 'INVALID_2FA_CODE', message: 'Invalid or expired code.' };

@Injectable()
export class Verify2faUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: IAdminUserRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: IRoleRepository,
    @Inject(TWOFA_CHALLENGE_REPOSITORY) private readonly challenges: ITwofaChallengeRepository,
    @Inject(ADMIN_OTP_SERVICE) private readonly otp: IAdminOtpService,
    @Inject(RBAC_CONFIG) private readonly config: RbacConfig,
    private readonly audit: AuditService,
    private readonly sessionIssuer: SessionIssuerService,
  ) {}

  async execute(command: Verify2faCommand): Promise<Verify2faResult> {
    const now = new Date();
    const challenge = await this.challenges.findById(command.challengeId);
    if (
      !challenge ||
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
      await this.audit.record({
        actorAdminId: challenge.adminUserId,
        action: 'admin.login.2fa',
        result: AuditResult.FAILED_LOGIN,
        summary: { reason: 'bad_2fa_code' },
        ipAddress: command.ipAddress,
      });
      throw new BadRequestException(INVALID);
    }

    challenge.consume(now);
    await this.challenges.save(challenge);

    const admin = await this.admins.findById(challenge.adminUserId);
    if (!admin || admin.status !== AdminUserStatus.ACTIVE) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Account not available.' });
    }
    const role = await this.roles.findById(admin.roleId);
    if (!role) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Account not available.' });
    }

    admin.registerSuccessfulLogin(now);
    await this.admins.save(admin);
    const tokens = await this.sessionIssuer.issueForLogin(
      admin.id,
      role.id,
      challenge.rememberDevice,
      command.deviceLabel,
      now,
    );
    await this.audit.record({
      actorAdminId: admin.id,
      action: 'admin.login',
      result: AuditResult.SUCCESS,
      summary: { via: '2fa' },
      ipAddress: command.ipAddress,
    });
    return { admin: { id: admin.id, roleName: role.name }, tokens };
  }
}
