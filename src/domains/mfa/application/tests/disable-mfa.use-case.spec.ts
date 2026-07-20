import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Customer } from '../../../auth/domain/entities/customer.entity';
import { CUSTOMER_REPOSITORY } from '../../../auth/domain/repositories/customer.repository.interface';
import { SESSION_REPOSITORY } from '../../../auth/domain/repositories/session.repository.interface';
import { NOTIFICATION_DISPATCHER } from '../../../auth/application/ports/notification-dispatcher.port';
import { OTP_SERVICE } from '../../../auth/application/ports/otp-service.port';
import { PASSWORD_HASHER } from '../../../auth/application/ports/password-hasher.port';
import { CustomerMfa } from '../../domain/entities/customer-mfa.entity';
import { MfaChallenge } from '../../domain/entities/mfa-challenge.entity';
import { MfaChannel } from '../../domain/enums/mfa-channel.enum';
import { MfaChallengePurpose } from '../../domain/enums/mfa-challenge-purpose.enum';
import { MfaEnforcement } from '../../domain/enums/mfa-enforcement.enum';
import { MfaSettings } from '../../domain/entities/mfa-settings.entity';
import { CUSTOMER_MFA_REPOSITORY } from '../../domain/repositories/customer-mfa.repository.interface';
import { MFA_CHALLENGE_REPOSITORY } from '../../domain/repositories/mfa-challenge.repository.interface';
import { MFA_SETTINGS_REPOSITORY } from '../../domain/repositories/mfa-settings.repository.interface';
import { MFA_CONFIG } from '../ports/mfa-config.port';
import { MfaChallengeIssuer } from '../services/mfa-challenge-issuer.service';
import { DisableMfaUseCase } from '../use-cases/disable-mfa.use-case';

describe('MFA — DisableMfaUseCase (FR-MFA-002/007/018)', () => {
  let useCase: DisableMfaUseCase;
  let customers: { findById: jest.Mock };
  let customerMfa: { findByCustomerId: jest.Mock; save: jest.Mock };
  let settingsRepo: { get: jest.Mock };
  let challenges: {
    findLatestByCustomer: jest.Mock;
    findLatestByCustomerAndPurpose: jest.Mock;
    countCreatedSince: jest.Mock;
    save: jest.Mock;
  };
  let sessions: { revokeAllForCustomerExcept: jest.Mock };
  let hasher: { compare: jest.Mock };
  let otp: { compare: jest.Mock };
  let dispatcher: { dispatchMfaStateChange: jest.Mock };
  let issuer: { issue: jest.Mock };

  const settings = () =>
    new MfaSettings('s1', true, true, MfaEnforcement.OPTIONAL, 300, 60, 5, null, new Date(), new Date(), MfaChannel.EMAIL);

  const makeCustomer = () => {
    const c = Customer.registerWithPhone('c1', 'Sabbir', '+8801712345678', new Date());
    c.setPassword('hash', new Date());
    c.attachVerifiedEmail('sabbir@example.com', new Date());
    return c;
  };

  const enabledState = () => {
    const s = CustomerMfa.none('c1', new Date());
    s.enable(MfaChannel.EMAIL, new Date());
    return s;
  };

  const disableChallenge = () =>
    MfaChallenge.issue('ch1', 'c1', MfaChallengePurpose.DISABLE, MfaChannel.EMAIL, 'sabbir@example.com', 'code-hash', 300, new Date());

  beforeEach(async () => {
    customers = { findById: jest.fn().mockResolvedValue(makeCustomer()) };
    customerMfa = {
      findByCustomerId: jest.fn().mockResolvedValue(enabledState()),
      save: jest.fn().mockImplementation((s: CustomerMfa) => Promise.resolve(s)),
    };
    settingsRepo = { get: jest.fn().mockResolvedValue(settings()) };
    challenges = {
      findLatestByCustomer: jest.fn().mockResolvedValue(null),
      findLatestByCustomerAndPurpose: jest.fn().mockResolvedValue(null),
      countCreatedSince: jest.fn().mockResolvedValue(0),
      save: jest.fn().mockImplementation((c: MfaChallenge) => Promise.resolve(c)),
    };
    sessions = { revokeAllForCustomerExcept: jest.fn().mockResolvedValue(undefined) };
    hasher = { compare: jest.fn().mockResolvedValue(true) };
    otp = { compare: jest.fn().mockResolvedValue(true) };
    dispatcher = { dispatchMfaStateChange: jest.fn().mockResolvedValue(undefined) };
    issuer = { issue: jest.fn().mockResolvedValue(disableChallenge()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisableMfaUseCase,
        { provide: CUSTOMER_REPOSITORY, useValue: customers },
        { provide: CUSTOMER_MFA_REPOSITORY, useValue: customerMfa },
        { provide: MFA_SETTINGS_REPOSITORY, useValue: settingsRepo },
        { provide: MFA_CHALLENGE_REPOSITORY, useValue: challenges },
        { provide: SESSION_REPOSITORY, useValue: sessions },
        { provide: PASSWORD_HASHER, useValue: hasher },
        { provide: OTP_SERVICE, useValue: otp },
        { provide: NOTIFICATION_DISPATCHER, useValue: dispatcher },
        { provide: MFA_CONFIG, useValue: { resendHourlyCap: 5, preAuthTtlSeconds: 300 } },
        { provide: MfaChallengeIssuer, useValue: issuer },
      ],
    }).compile();
    useCase = module.get(DisableMfaUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('2FA-verified session: password-only disable succeeds and revokes other sessions (AC2/AC3)', async () => {
    const result = await useCase.execute({
      customerId: 'c1',
      currentPassword: 'footy2026',
      sessionMfaVerified: true,
      currentSessionId: 'sess-current',
    });

    expect(result).toEqual({ enabled: false });
    expect(issuer.issue).not.toHaveBeenCalled();
    expect(sessions.revokeAllForCustomerExcept).toHaveBeenCalledWith('c1', 'sess-current', expect.any(Date));
    expect(dispatcher.dispatchMfaStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it('non-2FA-verified session without code: issues a disable challenge and 400 MFA_CODE_REQUIRED (AC2)', async () => {
    let thrown: unknown;
    try {
      await useCase.execute({
        customerId: 'c1',
        currentPassword: 'footy2026',
        sessionMfaVerified: false,
      });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
    expect(((thrown as HttpException).getResponse() as { code: string }).code).toBe('MFA_CODE_REQUIRED');
    expect(issuer.issue).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: MfaChallengePurpose.DISABLE }),
    );
    expect(customerMfa.save).not.toHaveBeenCalled();
  });

  it('re-requesting the code inside the cooldown → 429 (FR-MFA-008)', async () => {
    challenges.findLatestByCustomer.mockResolvedValue(disableChallenge()); // created just now

    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1', currentPassword: 'p', sessionMfaVerified: false });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(429);
    expect(issuer.issue).not.toHaveBeenCalled();
  });

  it('non-2FA-verified session with a valid code: disables (AC2)', async () => {
    challenges.findLatestByCustomerAndPurpose.mockResolvedValue(disableChallenge());

    const result = await useCase.execute({
      customerId: 'c1',
      currentPassword: 'footy2026',
      code: '482913',
      sessionMfaVerified: false,
      currentSessionId: 'sess-current',
    });

    expect(result).toEqual({ enabled: false });
    expect(otp.compare).toHaveBeenCalledWith('482913', 'code-hash');
    expect(sessions.revokeAllForCustomerExcept).toHaveBeenCalled();
  });

  it('wrong code → 400 INVALID_CODE; attempt registered; 2FA stays on', async () => {
    const challenge = disableChallenge();
    challenges.findLatestByCustomerAndPurpose.mockResolvedValue(challenge);
    otp.compare.mockResolvedValue(false);

    let thrown: unknown;
    try {
      await useCase.execute({
        customerId: 'c1',
        currentPassword: 'p',
        code: '000000',
        sessionMfaVerified: false,
      });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
    expect(challenge.attempts).toBe(1);
    expect(customerMfa.save).not.toHaveBeenCalled();
  });

  it('wrong password → 401 before any code is issued', async () => {
    hasher.compare.mockResolvedValue(false);

    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1', currentPassword: 'bad', sessionMfaVerified: false });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(401);
    expect(issuer.issue).not.toHaveBeenCalled();
  });
});
