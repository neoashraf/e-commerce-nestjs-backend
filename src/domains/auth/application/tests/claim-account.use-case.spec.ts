import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Customer } from '../../domain/entities/customer.entity';
import { OtpChallenge } from '../../domain/entities/otp-challenge.entity';
import { OtpPurpose } from '../../domain/enums/otp-purpose.enum';
import { CUSTOMER_REPOSITORY } from '../../domain/repositories/customer.repository.interface';
import { OTP_CHALLENGE_REPOSITORY } from '../../domain/repositories/otp-challenge.repository.interface';
import { SESSION_REPOSITORY } from '../../domain/repositories/session.repository.interface';
import { AUTH_CONFIG } from '../ports/auth-config.port';
import { OTP_SERVICE } from '../ports/otp-service.port';
import { PASSWORD_HASHER } from '../ports/password-hasher.port';
import { TOKEN_SERVICE } from '../ports/token-service.port';
import { ClaimAccountUseCase } from '../use-cases/claim-account.use-case';

describe('Auth — ClaimAccountUseCase', () => {
  let useCase: ClaimAccountUseCase;
  let challenges: { findById: jest.Mock; save: jest.Mock };
  let customers: { findActiveByPhone: jest.Mock; save: jest.Mock };
  let sessions: { save: jest.Mock };
  let otp: { compare: jest.Mock };
  let hasher: { hash: jest.Mock };
  let tokens: { signAccessToken: jest.Mock; mintRefreshToken: jest.Mock };

  const config = { otpAttemptCap: 5 };
  const registerChallenge = () =>
    OtpChallenge.issue('ch1', '+8801712345678', 'otp-hash', OtpPurpose.REGISTER, 300, new Date());
  const lightweight = () =>
    Customer.createLightweight('c1', 'Sabbir', '+8801712345678', null, false, false, new Date());

  beforeEach(async () => {
    challenges = { findById: jest.fn(), save: jest.fn().mockResolvedValue(undefined) };
    customers = {
      findActiveByPhone: jest.fn(),
      save: jest.fn().mockImplementation((c: Customer) => Promise.resolve(c)),
    };
    sessions = { save: jest.fn().mockResolvedValue(undefined) };
    otp = { compare: jest.fn() };
    hasher = { hash: jest.fn().mockResolvedValue('pw-hash') };
    tokens = {
      signAccessToken: jest.fn().mockResolvedValue({ token: 'acc', expiresIn: 900 }),
      mintRefreshToken: jest.fn().mockReturnValue({ raw: 'ref', hash: 'refh', expiresAt: new Date() }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaimAccountUseCase,
        { provide: OTP_CHALLENGE_REPOSITORY, useValue: challenges },
        { provide: CUSTOMER_REPOSITORY, useValue: customers },
        { provide: SESSION_REPOSITORY, useValue: sessions },
        { provide: OTP_SERVICE, useValue: otp },
        { provide: PASSWORD_HASHER, useValue: hasher },
        { provide: TOKEN_SERVICE, useValue: tokens },
        { provide: AUTH_CONFIG, useValue: config },
      ],
    }).compile();
    useCase = module.get(ClaimAccountUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('activates a lightweight account, sets a password, and issues tokens (FR-AUTH-071)', async () => {
    challenges.findById.mockResolvedValue(registerChallenge());
    otp.compare.mockResolvedValue(true);
    const customer = lightweight();
    customers.findActiveByPhone.mockResolvedValue(customer);

    const result = await useCase.execute({ challengeId: 'ch1', code: '204815', password: 'footy2026' });

    expect(customer.isLightweight).toBe(false);
    expect(customer.phoneVerified).toBe(true);
    expect(customer.passwordHash).toBe('pw-hash');
    expect(result.customer.isLightweight).toBe(false);
    expect(result.tokens.accessToken).toBe('acc');
    expect(sessions.save).toHaveBeenCalled();
  });

  it('returns 409 ACCOUNT_EXISTS when the phone is already a full account (FR-AUTH-072)', async () => {
    challenges.findById.mockResolvedValue(registerChallenge());
    otp.compare.mockResolvedValue(true);
    customers.findActiveByPhone.mockResolvedValue(
      Customer.registerWithPhone('c1', 'Sabbir', '+8801712345678', new Date()),
    );

    let thrown: unknown;
    try {
      await useCase.execute({ challengeId: 'ch1', code: '204815' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(409);
    expect(customers.save).not.toHaveBeenCalled();
  });

  it('rejects an invalid OTP with 400', async () => {
    challenges.findById.mockResolvedValue(registerChallenge());
    otp.compare.mockResolvedValue(false);

    let thrown: unknown;
    try {
      await useCase.execute({ challengeId: 'ch1', code: 'wrong' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
  });

  it('rejects a weak password with 400 before consuming the OTP', async () => {
    let thrown: unknown;
    try {
      await useCase.execute({ challengeId: 'ch1', code: '204815', password: 'short' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
    expect(challenges.findById).not.toHaveBeenCalled();
  });
});
