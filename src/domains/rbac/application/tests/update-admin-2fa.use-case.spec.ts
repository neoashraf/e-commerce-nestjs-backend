import { HttpException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AdminUser } from '../../domain/entities/admin-user.entity';
import { TwofaChallenge } from '../../domain/entities/twofa-challenge.entity';
import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';
import { TwofaChannel } from '../../domain/enums/twofa-channel.enum';
import { TwofaPurpose } from '../../domain/enums/twofa-purpose.enum';
import { ADMIN_USER_REPOSITORY } from '../../domain/repositories/admin-user.repository.interface';
import { ADMIN_SESSION_REPOSITORY } from '../../domain/repositories/admin-session.repository.interface';
import { TWOFA_CHALLENGE_REPOSITORY } from '../../domain/repositories/twofa-challenge.repository.interface';
import { ADMIN_NOTIFICATION_DISPATCHER } from '../ports/admin-notification.port';
import { ADMIN_OTP_SERVICE } from '../ports/admin-otp.port';
import { PASSWORD_HASHER } from '../ports/password-hasher.port';
import { RBAC_CONFIG } from '../ports/rbac-config.port';
import { AuditService } from '../services/audit.service';
import { TwofaChallengeIssuerService } from '../services/twofa-challenge-issuer.service';
import { UpdateAdmin2faUseCase } from '../use-cases/update-admin-2fa.use-case';

describe('RBAC — UpdateAdmin2faUseCase (v0.2 enable→confirm, FR-RBAC-008/009)', () => {
  let useCase: UpdateAdmin2faUseCase;
  let admins: { findById: jest.Mock; save: jest.Mock };
  let sessions: { revokeAllForAdminExcept: jest.Mock };
  let challenges: { findLatestByAdminAndPurpose: jest.Mock; save: jest.Mock };
  let hasher: { compare: jest.Mock };
  let otp: { compare: jest.Mock };
  let notifier: { dispatchTwofaStateChange: jest.Mock };
  let issuer: { issue: jest.Mock };
  let audit: { record: jest.Mock };

  const makeAdmin = (twofaEnabled = false) => {
    const a = new AdminUser('ad1', 'Ops', 'ops@store.com', null, 'hash', 'role1', false, null, AdminUserStatus.ACTIVE, 0, null, null, new Date(), new Date(), null);
    if (twofaEnabled) a.enableTwofa(TwofaChannel.EMAIL, new Date());
    return a;
  };

  const issuedView = {
    challengeId: 'ch1',
    sentTo: 'o**@store.com',
    expiresIn: 300,
    resendAfter: 60,
  };

  const disableChallenge = () =>
    new TwofaChallenge('ch1', 'ad1', 'code-hash', TwofaChannel.EMAIL, false, 0, new Date(Date.now() + 300_000), null, new Date(), TwofaPurpose.DISABLE);

  beforeEach(async () => {
    admins = { findById: jest.fn(), save: jest.fn().mockImplementation((a) => Promise.resolve(a)) };
    sessions = { revokeAllForAdminExcept: jest.fn().mockResolvedValue(undefined) };
    challenges = {
      findLatestByAdminAndPurpose: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((c) => Promise.resolve(c)),
    };
    hasher = { compare: jest.fn().mockResolvedValue(true) };
    otp = { compare: jest.fn().mockResolvedValue(true) };
    notifier = { dispatchTwofaStateChange: jest.fn().mockResolvedValue(undefined) };
    issuer = { issue: jest.fn().mockResolvedValue(issuedView) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateAdmin2faUseCase,
        { provide: ADMIN_USER_REPOSITORY, useValue: admins },
        { provide: ADMIN_SESSION_REPOSITORY, useValue: sessions },
        { provide: TWOFA_CHALLENGE_REPOSITORY, useValue: challenges },
        { provide: PASSWORD_HASHER, useValue: hasher },
        { provide: ADMIN_OTP_SERVICE, useValue: otp },
        { provide: ADMIN_NOTIFICATION_DISPATCHER, useValue: notifier },
        { provide: RBAC_CONFIG, useValue: { twofaAttemptCap: 5 } },
        { provide: TwofaChallengeIssuerService, useValue: issuer },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    useCase = module.get(UpdateAdmin2faUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('enable issues a challenge — 2FA NOT active until confirm (AC1, FR-RBAC-008)', async () => {
    const admin = makeAdmin(false);
    admins.findById.mockResolvedValue(admin);

    const result = await useCase.execute({
      adminId: 'ad1',
      enabled: true,
      currentPassword: 'p',
      sessionMfaVerified: false,
    });

    expect(result.twofaEnabled).toBe(false);
    expect(result.verification).toEqual(issuedView);
    expect(issuer.issue).toHaveBeenCalledWith(admin, TwofaPurpose.ENABLE, expect.any(Date));
    expect(admin.twofaEnabled).toBe(false);
    expect(admins.save).not.toHaveBeenCalled();
  });

  it('rejects a wrong current password with 401 (AC1)', async () => {
    admins.findById.mockResolvedValue(makeAdmin(false));
    hasher.compare.mockResolvedValue(false);
    await expect(
      useCase.execute({ adminId: 'ad1', enabled: true, currentPassword: 'wrong', sessionMfaVerified: false }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(issuer.issue).not.toHaveBeenCalled();
  });

  it('disable from a 2FA-verified session is password-only (AC4/AC6 — incl. Super Admin)', async () => {
    const admin = makeAdmin(true);
    admins.findById.mockResolvedValue(admin);

    const result = await useCase.execute({
      adminId: 'ad1',
      enabled: false,
      currentPassword: 'p',
      sessionMfaVerified: true,
      currentSessionId: 'sess-current',
    });

    expect(result.twofaEnabled).toBe(false);
    expect(admin.twofaEnabled).toBe(false);
    expect(sessions.revokeAllForAdminExcept).toHaveBeenCalledWith('ad1', 'sess-current', expect.any(Date));
    expect(notifier.dispatchTwofaStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.2fa.disable' }),
    );
  });

  it('disable from a non-verified session without code returns a verification challenge (AC4)', async () => {
    const admin = makeAdmin(true);
    admins.findById.mockResolvedValue(admin);

    const result = await useCase.execute({
      adminId: 'ad1',
      enabled: false,
      currentPassword: 'p',
      sessionMfaVerified: false,
    });

    expect(result.twofaEnabled).toBe(true); // still on
    expect(result.verification).toEqual(issuedView);
    expect(issuer.issue).toHaveBeenCalledWith(admin, TwofaPurpose.DISABLE, expect.any(Date));
    expect(admin.twofaEnabled).toBe(true);
  });

  it('disable with a valid fresh code succeeds from a non-verified session (AC4)', async () => {
    const admin = makeAdmin(true);
    admins.findById.mockResolvedValue(admin);
    challenges.findLatestByAdminAndPurpose.mockResolvedValue(disableChallenge());

    const result = await useCase.execute({
      adminId: 'ad1',
      enabled: false,
      currentPassword: 'p',
      code: '482913',
      sessionMfaVerified: false,
      currentSessionId: 'sess-current',
    });

    expect(result.twofaEnabled).toBe(false);
    expect(challenges.findLatestByAdminAndPurpose).toHaveBeenCalledWith('ad1', TwofaPurpose.DISABLE);
    expect(sessions.revokeAllForAdminExcept).toHaveBeenCalled();
  });

  it('disable with a wrong code → 400 and 2FA stays on', async () => {
    const admin = makeAdmin(true);
    admins.findById.mockResolvedValue(admin);
    const challenge = disableChallenge();
    challenges.findLatestByAdminAndPurpose.mockResolvedValue(challenge);
    otp.compare.mockResolvedValue(false);

    let thrown: unknown;
    try {
      await useCase.execute({
        adminId: 'ad1',
        enabled: false,
        currentPassword: 'p',
        code: '000000',
        sessionMfaVerified: false,
      });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
    expect(challenge.attempts).toBe(1);
    expect(admin.twofaEnabled).toBe(true);
  });

  it('disable when 2FA is not enabled → 400 TWOFA_NOT_ENABLED', async () => {
    admins.findById.mockResolvedValue(makeAdmin(false));
    let thrown: unknown;
    try {
      await useCase.execute({ adminId: 'ad1', enabled: false, currentPassword: 'p', sessionMfaVerified: true });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
  });
});
