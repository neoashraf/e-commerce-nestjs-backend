import { randomUUID } from 'crypto';
import { HttpException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';

/** HTTP 423 Locked is not in Nest's HttpStatus enum. */
const HTTP_LOCKED = 423;

import { AdminUser } from '../../domain/entities/admin-user.entity';
import { TwofaChallenge } from '../../domain/entities/twofa-challenge.entity';
import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';
import { AuditResult } from '../../domain/enums/audit-result.enum';
import { TwofaChannel } from '../../domain/enums/twofa-channel.enum';
import {
  ADMIN_USER_REPOSITORY,
  IAdminUserRepository,
} from '../../domain/repositories/admin-user.repository.interface';
import { IRoleRepository, ROLE_REPOSITORY } from '../../domain/repositories/role.repository.interface';
import {
  ITwofaChallengeRepository,
  TWOFA_CHALLENGE_REPOSITORY,
} from '../../domain/repositories/twofa-challenge.repository.interface';
import { IPasswordHasher, PASSWORD_HASHER } from '../ports/password-hasher.port';
import { ADMIN_OTP_SERVICE, IAdminOtpService } from '../ports/admin-otp.port';
import {
  ADMIN_NOTIFICATION_DISPATCHER,
  IAdminNotificationDispatcher,
} from '../ports/admin-notification.port';
import { RBAC_CONFIG, RbacConfig } from '../ports/rbac-config.port';
import { AuditService } from '../services/audit.service';
import { IssuedTokens, SessionIssuerService } from '../services/session-issuer.service';

export interface AdminLoginCommand {
  email: string;
  password: string;
  rememberDevice: boolean;
  ipAddress: string | null;
  deviceLabel: string | null;
}

export type AdminLoginResult =
  | { twofaRequired: true; challengeId: string; channel: TwofaChannel; expiresIn: number }
  | {
      twofaRequired: false;
      admin: { id: string; fullName: string; roleName: string };
      tokens: IssuedTokens;
    };

@Injectable()
export class AdminLoginUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: IAdminUserRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: IRoleRepository,
    @Inject(TWOFA_CHALLENGE_REPOSITORY) private readonly challenges: ITwofaChallengeRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(ADMIN_OTP_SERVICE) private readonly otp: IAdminOtpService,
    @Inject(ADMIN_NOTIFICATION_DISPATCHER) private readonly notifier: IAdminNotificationDispatcher,
    @Inject(RBAC_CONFIG) private readonly config: RbacConfig,
    private readonly audit: AuditService,
    private readonly sessionIssuer: SessionIssuerService,
  ) {}

  async execute(command: AdminLoginCommand): Promise<AdminLoginResult> {
    const now = new Date();
    const email = command.email.trim().toLowerCase();
    const admin = await this.admins.findByEmail(email);

    // Unknown email → invalid credentials (no enumeration), recorded as a security event.
    if (!admin) {
      await this.audit.record({
        actorAdminId: null,
        action: 'admin.login',
        result: AuditResult.FAILED_LOGIN,
        summary: { email, reason: 'unknown_email' },
        ipAddress: command.ipAddress,
      });
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
    }

    if (admin.status === AdminUserStatus.SUSPENDED) {
      await this.recordFailed(admin.id, command.ipAddress, 'suspended');
      throw new HttpException(
        { code: 'ACCOUNT_SUSPENDED', message: 'This admin account is suspended.' },
        HTTP_LOCKED,
      );
    }
    // pending (no password yet) / deleted → invalid credentials.
    if (admin.status !== AdminUserStatus.ACTIVE || !admin.passwordHash) {
      await this.recordFailed(admin.id, command.ipAddress, 'inactive');
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
    }

    if (admin.isLocked(now)) {
      throw this.lockedException(admin, now);
    }

    const matches = await this.hasher.compare(command.password, admin.passwordHash);
    if (!matches) {
      admin.registerFailedLogin(now, this.config.loginLockThreshold, this.config.loginLockMinutes);
      await this.admins.save(admin);
      await this.recordFailed(admin.id, command.ipAddress, 'bad_password');
      if (admin.isLocked(now)) {
        throw this.lockedException(admin, now);
      }
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
    }

    const role = await this.roles.findById(admin.roleId);
    if (!role) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
    }

    // Correct password → clear failed-attempt counter.
    admin.failedLoginAttempts = 0;
    admin.lockedUntil = null;

    // 2FA is mandatory for Super Admin, otherwise per the admin's own toggle (FR-RBAC-002).
    const twofaRequired = admin.twofaEnabled || role.isSuperAdmin();
    if (twofaRequired) {
      await this.admins.save(admin);
      return this.issueChallenge(admin, command.rememberDevice, now);
    }

    admin.registerSuccessfulLogin(now);
    await this.admins.save(admin);
    const tokens = await this.sessionIssuer.issueForLogin(
      admin.id,
      role.id,
      command.rememberDevice,
      command.deviceLabel,
      now,
    );
    await this.recordSuccess(admin.id, command.ipAddress);
    return {
      twofaRequired: false,
      admin: { id: admin.id, fullName: admin.fullName, roleName: role.name },
      tokens,
    };
  }

  private async issueChallenge(
    admin: AdminUser,
    rememberDevice: boolean,
    now: Date,
  ): Promise<AdminLoginResult> {
    // sms channel needs a stored phone; otherwise fall back to email (§12.6).
    let channel = admin.twofaChannel ?? TwofaChannel.EMAIL;
    if (channel === TwofaChannel.SMS && !admin.phone) {
      channel = TwofaChannel.EMAIL;
    }
    const generated = await this.otp.generate();
    const ttl = this.config.twofaOtpTtlSeconds;
    const challenge = new TwofaChallenge(
      randomUUID(),
      admin.id,
      generated.hash,
      channel,
      rememberDevice,
      0,
      new Date(now.getTime() + ttl * 1000),
      null,
      now,
    );
    await this.challenges.save(challenge);
    await this.notifier.dispatchTwofaCode({
      channel,
      phone: admin.phone,
      email: admin.email,
      code: generated.code,
      ttlMinutes: Math.ceil(ttl / 60),
    });
    return { twofaRequired: true, challengeId: challenge.id, channel, expiresIn: ttl };
  }

  private lockedException(admin: AdminUser, now: Date): HttpException {
    const retryAfter = admin.lockedUntil
      ? Math.max(1, Math.ceil((admin.lockedUntil.getTime() - now.getTime()) / 1000))
      : this.config.loginLockMinutes * 60;
    return new HttpException(
      { code: 'ACCOUNT_LOCKED', message: 'Account temporarily locked. Try again later.', retry_after: retryAfter },
      HTTP_LOCKED,
    );
  }

  private recordFailed(adminId: string, ip: string | null, reason: string): Promise<void> {
    return this.audit.record({
      actorAdminId: adminId,
      action: 'admin.login',
      result: AuditResult.FAILED_LOGIN,
      summary: { reason },
      ipAddress: ip,
    });
  }

  private recordSuccess(adminId: string, ip: string | null): Promise<void> {
    return this.audit.record({
      actorAdminId: adminId,
      action: 'admin.login',
      result: AuditResult.SUCCESS,
      ipAddress: ip,
    });
  }
}
