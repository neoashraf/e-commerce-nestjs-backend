import { HttpException } from '@nestjs/common';
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
import { RBAC_CONFIG } from '../ports/rbac-config.port';
import { AuditService } from '../services/audit.service';
import { ConfirmAdmin2faUseCase } from '../use-cases/confirm-admin-2fa.use-case';

describe('RBAC — ConfirmAdmin2faUseCase (FR-RBAC-008/009)', () => {
  let useCase: ConfirmAdmin2faUseCase;
  let admins: { findById: jest.Mock; save: jest.Mock };
  let sessions: { revokeAllForAdminExcept: jest.Mock };
  let challenges: { findById: jest.Mock; save: jest.Mock };
  let otp: { compare: jest.Mock };
  let notifier: { dispatchTwofaStateChange: jest.Mock };
  let audit: { record: jest.Mock };

  const makeAdmin = () =>
    new AdminUser('ad1', 'Ops', 'ops@store.com', null, 'hash', 'role1', false, null, AdminUserStatus.ACTIVE, 0, null, null, new Date(), new Date(), null);

  const enableChallenge = (purpose: TwofaPurpose = TwofaPurpose.ENABLE) =>
    new TwofaChallenge('ch1', 'ad1', 'code-hash', TwofaChannel.EMAIL, false, 0, new Date(Date.now() + 300_000), null, new Date(), purpose);

  beforeEach(async () => {
    admins = { findById: jest.fn().mockResolvedValue(makeAdmin()), save: jest.fn().mockImplementation((a) => Promise.resolve(a)) };
    sessions = { revokeAllForAdminExcept: jest.fn().mockResolvedValue(undefined) };
    challenges = { findById: jest.fn(), save: jest.fn().mockImplementation((c) => Promise.resolve(c)) };
    otp = { compare: jest.fn().mockResolvedValue(true) };
    notifier = { dispatchTwofaStateChange: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfirmAdmin2faUseCase,
        { provide: ADMIN_USER_REPOSITORY, useValue: admins },
        { provide: ADMIN_SESSION_REPOSITORY, useValue: sessions },
        { provide: TWOFA_CHALLENGE_REPOSITORY, useValue: challenges },
        { provide: ADMIN_OTP_SERVICE, useValue: otp },
        { provide: ADMIN_NOTIFICATION_DISPATCHER, useValue: notifier },
        { provide: RBAC_CONFIG, useValue: { twofaAttemptCap: 5 } },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    useCase = module.get(ConfirmAdmin2faUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('activates 2FA on a valid code, revokes other sessions, notifies, audits (AC2/AC5)', async () => {
    const challenge = enableChallenge();
    challenges.findById.mockResolvedValue(challenge);

    const result = await useCase.execute({
      adminId: 'ad1',
      challengeId: 'ch1',
      code: '204815',
      currentSessionId: 'sess-current',
    });

    expect(result).toEqual({ twofaEnabled: true });
    expect(challenge.isConsumed()).toBe(true);
    const saved = admins.save.mock.calls[0][0] as AdminUser;
    expect(saved.twofaEnabled).toBe(true);
    expect(saved.twofaChannel).toBe(TwofaChannel.EMAIL); // email-only (AC6)
    expect(sessions.revokeAllForAdminExcept).toHaveBeenCalledWith('ad1', 'sess-current', expect.any(Date));
    expect(notifier.dispatchTwofaStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.2fa.enable' }),
    );
  });

  it('rejects a wrong code with 400 and registers the attempt (AC2)', async () => {
    const challenge = enableChallenge();
    challenges.findById.mockResolvedValue(challenge);
    otp.compare.mockResolvedValue(false);

    let thrown: unknown;
    try {
      await useCase.execute({ adminId: 'ad1', challengeId: 'ch1', code: '000000' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
    expect(challenge.attempts).toBe(1);
    expect(admins.save).not.toHaveBeenCalled();
  });

  it('rejects a non-enable challenge — purpose binding (AC2)', async () => {
    challenges.findById.mockResolvedValue(enableChallenge(TwofaPurpose.LOGIN));

    let thrown: unknown;
    try {
      await useCase.execute({ adminId: 'ad1', challengeId: 'ch1', code: '204815' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
    expect(admins.save).not.toHaveBeenCalled();
  });

  it('rejects an expired or consumed challenge with 400 (AC2)', async () => {
    const challenge = enableChallenge();
    challenge.consume(new Date());
    challenges.findById.mockResolvedValue(challenge);

    let thrown: unknown;
    try {
      await useCase.execute({ adminId: 'ad1', challengeId: 'ch1', code: '204815' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
  });
});
