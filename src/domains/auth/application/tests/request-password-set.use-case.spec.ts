import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Customer } from '../../domain/entities/customer.entity';
import { OtpChallenge } from '../../domain/entities/otp-challenge.entity';
import { OtpPurpose } from '../../domain/enums/otp-purpose.enum';
import { Session } from '../../domain/entities/session.entity';
import { CUSTOMER_REPOSITORY } from '../../domain/repositories/customer.repository.interface';
import { OTP_CHALLENGE_REPOSITORY } from '../../domain/repositories/otp-challenge.repository.interface';
import { PASSWORD_SET_TOKEN_REPOSITORY } from '../../domain/repositories/password-set-token.repository.interface';
import { SESSION_REPOSITORY } from '../../domain/repositories/session.repository.interface';
import { AUTH_CONFIG } from '../ports/auth-config.port';
import { NOTIFICATION_DISPATCHER } from '../ports/notification-dispatcher.port';
import { OTP_SERVICE } from '../ports/otp-service.port';
import { VERIFICATION_TOKEN_SERVICE } from '../ports/verification-token.port';
import { RequestPasswordSetUseCase } from '../use-cases/request-password-set.use-case';

describe('Auth — RequestPasswordSetUseCase', () => {
  let useCase: RequestPasswordSetUseCase;
  let customers: { findById: jest.Mock };
  let sessions: { findById: jest.Mock };
  let challenges: {
    findLatestByPhone: jest.Mock;
    countCreatedSince: jest.Mock;
    consumeOutstandingForPhone: jest.Mock;
    save: jest.Mock;
  };
  let setTokens: { consumeOutstandingForCustomer: jest.Mock; save: jest.Mock };
  let otp: { generateCode: jest.Mock; hash: jest.Mock };
  let tokenService: { mint: jest.Mock; hash: jest.Mock };
  let dispatcher: { dispatchOtp: jest.Mock };

  const config = {
    otpTtlSeconds: 300,
    otpResendCooldownSeconds: 60,
    otpHourlyCap: 5,
    otpAttemptCap: 5,
    passwordSetFreshnessSeconds: 600,
    passwordSetTokenTtlSeconds: 600,
    otpDevReturn: false,
  };

  const phoneCustomer = () =>
    Customer.registerWithPhone('c1', 'Sabbir', '+8801712345678', new Date());

  const freshSession = (otpVerifiedAgoMs: number) =>
    Session.issue(
      'sess-current',
      'c1',
      'rt-hash',
      new Date(Date.now() + 3600_000),
      new Date(),
      null,
      new Date(Date.now() - otpVerifiedAgoMs),
    );

  beforeEach(async () => {
    customers = { findById: jest.fn() };
    sessions = { findById: jest.fn().mockResolvedValue(null) };
    challenges = {
      findLatestByPhone: jest.fn().mockResolvedValue(null),
      countCreatedSince: jest.fn().mockResolvedValue(0),
      consumeOutstandingForPhone: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockImplementation((c: OtpChallenge) => Promise.resolve(c)),
    };
    setTokens = {
      consumeOutstandingForCustomer: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockImplementation((t) => Promise.resolve(t)),
    };
    otp = { generateCode: jest.fn().mockReturnValue('482913'), hash: jest.fn().mockResolvedValue('otp-hash') };
    tokenService = {
      mint: jest.fn().mockReturnValue({ raw: 'rawtok', hash: 'unused' }),
      hash: jest.fn().mockReturnValue('token-hash'),
    };
    dispatcher = { dispatchOtp: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestPasswordSetUseCase,
        { provide: CUSTOMER_REPOSITORY, useValue: customers },
        { provide: SESSION_REPOSITORY, useValue: sessions },
        { provide: OTP_CHALLENGE_REPOSITORY, useValue: challenges },
        { provide: PASSWORD_SET_TOKEN_REPOSITORY, useValue: setTokens },
        { provide: OTP_SERVICE, useValue: otp },
        { provide: VERIFICATION_TOKEN_SERVICE, useValue: tokenService },
        { provide: NOTIFICATION_DISPATCHER, useValue: dispatcher },
        { provide: AUTH_CONFIG, useValue: config },
      ],
    }).compile();
    useCase = module.get(RequestPasswordSetUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('issues a password_set OTP to the account phone (AC1, FR-AUTH-036)', async () => {
    customers.findById.mockResolvedValue(phoneCustomer());

    const result = await useCase.execute({ customerId: 'c1', currentSessionId: 'sess-current' });

    expect(result.otpRequired).toBe(true);
    expect(result.challengeId).toBeDefined();
    expect(result.expiresIn).toBe(300);
    expect(result.resendAfter).toBe(60);
    const saved = challenges.save.mock.calls[0][0] as OtpChallenge;
    expect(saved.purpose).toBe(OtpPurpose.PASSWORD_SET);
    expect(saved.phone).toBe('+8801712345678');
    expect(dispatcher.dispatchOtp).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'password_set', phone: '+8801712345678' }),
    );
  });

  it('respects the resend cooldown (FR-AUTH-022)', async () => {
    customers.findById.mockResolvedValue(phoneCustomer());
    challenges.findLatestByPhone.mockResolvedValue(
      OtpChallenge.issue('prev', '+8801712345678', 'h', OtpPurpose.PASSWORD_SET, 300, new Date()),
    );

    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(429);
    expect(challenges.save).not.toHaveBeenCalled();
  });

  it('respects the hourly cap (FR-AUTH-022)', async () => {
    customers.findById.mockResolvedValue(phoneCustomer());
    challenges.countCreatedSince.mockResolvedValue(5);

    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(429);
  });

  it('returns a single-use set_token inside the freshness window (AC2, FR-AUTH-037)', async () => {
    customers.findById.mockResolvedValue(phoneCustomer());
    sessions.findById.mockResolvedValue(freshSession(5 * 60_000)); // OTP-verified 5 min ago

    const result = await useCase.execute({ customerId: 'c1', currentSessionId: 'sess-current' });

    expect(result.otpRequired).toBe(false);
    expect(result.setToken).toBe('pst_rawtok');
    expect(result.expiresIn).toBe(600);
    expect(setTokens.consumeOutstandingForCustomer).toHaveBeenCalledWith('c1', expect.any(Date));
    expect(setTokens.save).toHaveBeenCalled();
    expect(challenges.save).not.toHaveBeenCalled();
    expect(dispatcher.dispatchOtp).not.toHaveBeenCalled();
  });

  it('falls back to the OTP path when the OTP verification is older than the window', async () => {
    customers.findById.mockResolvedValue(phoneCustomer());
    sessions.findById.mockResolvedValue(freshSession(15 * 60_000)); // 15 min ago > 10 min window

    const result = await useCase.execute({ customerId: 'c1', currentSessionId: 'sess-current' });

    expect(result.otpRequired).toBe(true);
    expect(setTokens.save).not.toHaveBeenCalled();
  });

  it('rejects an account that already has a password with 409 PASSWORD_EXISTS (AC5)', async () => {
    customers.findById.mockResolvedValue(
      Customer.registerWithEmail('c1', 'Sabbir', 'sabbir@example.com', 'hash', false, new Date()),
    );

    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(409);
    expect(((thrown as HttpException).getResponse() as { code: string }).code).toBe(
      'PASSWORD_EXISTS',
    );
  });

  it('rejects an account without a verified phone with 409 PHONE_REQUIRED (AC5)', async () => {
    customers.findById.mockResolvedValue(
      Customer.registerWithGoogle('c1', 'Sabbir', 'sabbir@example.com', new Date()),
    );

    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(409);
    expect(((thrown as HttpException).getResponse() as { code: string }).code).toBe(
      'PHONE_REQUIRED',
    );
  });
});
