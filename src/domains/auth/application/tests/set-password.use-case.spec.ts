import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Customer } from '../../domain/entities/customer.entity';
import { OtpChallenge } from '../../domain/entities/otp-challenge.entity';
import { OtpPurpose } from '../../domain/enums/otp-purpose.enum';
import { PasswordSetToken } from '../../domain/entities/password-set-token.entity';
import { CUSTOMER_REPOSITORY } from '../../domain/repositories/customer.repository.interface';
import { OTP_CHALLENGE_REPOSITORY } from '../../domain/repositories/otp-challenge.repository.interface';
import { PASSWORD_SET_TOKEN_REPOSITORY } from '../../domain/repositories/password-set-token.repository.interface';
import { SESSION_REPOSITORY } from '../../domain/repositories/session.repository.interface';
import { AUTH_CONFIG } from '../ports/auth-config.port';
import { NOTIFICATION_DISPATCHER } from '../ports/notification-dispatcher.port';
import { OTP_SERVICE } from '../ports/otp-service.port';
import { PASSWORD_HASHER } from '../ports/password-hasher.port';
import { VERIFICATION_TOKEN_SERVICE } from '../ports/verification-token.port';
import { SetPasswordUseCase } from '../use-cases/set-password.use-case';

describe('Auth — SetPasswordUseCase', () => {
  let useCase: SetPasswordUseCase;
  let customers: { findById: jest.Mock; save: jest.Mock };
  let challenges: { findById: jest.Mock; save: jest.Mock };
  let setTokens: { findByTokenHash: jest.Mock; save: jest.Mock };
  let sessions: { revokeAllForCustomerExcept: jest.Mock };
  let otp: { compare: jest.Mock };
  let tokenService: { hash: jest.Mock };
  let hasher: { hash: jest.Mock };
  let notifier: { dispatchPasswordChanged: jest.Mock };

  const config = { otpAttemptCap: 5 };

  const phoneCustomer = () =>
    Customer.registerWithPhone('c1', 'Sabbir', '+8801712345678', new Date());

  const validChallenge = () =>
    OtpChallenge.issue('ch1', '+8801712345678', 'otp-hash', OtpPurpose.PASSWORD_SET, 300, new Date());

  const validToken = () => PasswordSetToken.issue('t1', 'c1', 'token-hash', 600, new Date());

  beforeEach(async () => {
    customers = {
      findById: jest.fn(),
      save: jest.fn().mockImplementation((c: Customer) => Promise.resolve(c)),
    };
    challenges = {
      findById: jest.fn(),
      save: jest.fn().mockImplementation((c: OtpChallenge) => Promise.resolve(c)),
    };
    setTokens = {
      findByTokenHash: jest.fn(),
      save: jest.fn().mockImplementation((t: PasswordSetToken) => Promise.resolve(t)),
    };
    sessions = { revokeAllForCustomerExcept: jest.fn().mockResolvedValue(undefined) };
    otp = { compare: jest.fn() };
    tokenService = { hash: jest.fn().mockReturnValue('token-hash') };
    hasher = { hash: jest.fn().mockResolvedValue('new-hash') };
    notifier = { dispatchPasswordChanged: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SetPasswordUseCase,
        { provide: CUSTOMER_REPOSITORY, useValue: customers },
        { provide: OTP_CHALLENGE_REPOSITORY, useValue: challenges },
        { provide: PASSWORD_SET_TOKEN_REPOSITORY, useValue: setTokens },
        { provide: SESSION_REPOSITORY, useValue: sessions },
        { provide: OTP_SERVICE, useValue: otp },
        { provide: VERIFICATION_TOKEN_SERVICE, useValue: tokenService },
        { provide: PASSWORD_HASHER, useValue: hasher },
        { provide: NOTIFICATION_DISPATCHER, useValue: notifier },
        { provide: AUTH_CONFIG, useValue: config },
      ],
    }).compile();
    useCase = module.get(SetPasswordUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('sets the password via a valid OTP code (AC3, FR-AUTH-036)', async () => {
    const customer = phoneCustomer();
    customers.findById.mockResolvedValue(customer);
    const challenge = validChallenge();
    challenges.findById.mockResolvedValue(challenge);
    otp.compare.mockResolvedValue(true);

    await useCase.execute({
      customerId: 'c1',
      newPassword: 'footy2026',
      challengeId: 'ch1',
      code: '482913',
      currentSessionId: 'sess-current',
    });

    expect(customer.passwordHash).toBe('new-hash');
    expect(challenge.isConsumed()).toBe(true);
    expect(customers.save).toHaveBeenCalled();
  });

  it('sets the password via a valid set_token (AC3, FR-AUTH-037)', async () => {
    const customer = phoneCustomer();
    customers.findById.mockResolvedValue(customer);
    const token = validToken();
    setTokens.findByTokenHash.mockResolvedValue(token);

    await useCase.execute({
      customerId: 'c1',
      newPassword: 'footy2026',
      setToken: 'pst_rawtok',
      currentSessionId: 'sess-current',
    });

    expect(tokenService.hash).toHaveBeenCalledWith('pst_rawtok');
    expect(customer.passwordHash).toBe('new-hash');
    expect(token.isConsumed()).toBe(true);
    expect(setTokens.save).toHaveBeenCalled();
  });

  it('revokes every other session and notifies on success (AC4, FR-AUTH-038)', async () => {
    customers.findById.mockResolvedValue(phoneCustomer());
    setTokens.findByTokenHash.mockResolvedValue(validToken());

    await useCase.execute({
      customerId: 'c1',
      newPassword: 'footy2026',
      setToken: 'pst_rawtok',
      currentSessionId: 'sess-current',
    });

    expect(sessions.revokeAllForCustomerExcept).toHaveBeenCalledWith(
      'c1',
      'sess-current',
      expect.any(Date),
    );
    expect(notifier.dispatchPasswordChanged).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'password_set', phone: '+8801712345678' }),
    );
  });

  it('rejects a wrong OTP code with 400 and registers the attempt (AC5)', async () => {
    customers.findById.mockResolvedValue(phoneCustomer());
    const challenge = validChallenge();
    challenges.findById.mockResolvedValue(challenge);
    otp.compare.mockResolvedValue(false);

    let thrown: unknown;
    try {
      await useCase.execute({
        customerId: 'c1',
        newPassword: 'footy2026',
        challengeId: 'ch1',
        code: '000000',
      });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
    expect(challenge.attempts).toBe(1);
    expect(customers.save).not.toHaveBeenCalled();
  });

  it('rejects a challenge issued for another purpose or phone with 400 (BR-AUTH-3)', async () => {
    customers.findById.mockResolvedValue(phoneCustomer());
    challenges.findById.mockResolvedValue(
      OtpChallenge.issue('ch1', '+8801712345678', 'otp-hash', OtpPurpose.LOGIN, 300, new Date()),
    );

    let thrown: unknown;
    try {
      await useCase.execute({
        customerId: 'c1',
        newPassword: 'footy2026',
        challengeId: 'ch1',
        code: '482913',
      });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
  });

  it('rejects an expired or consumed set_token with 400 (AC5)', async () => {
    customers.findById.mockResolvedValue(phoneCustomer());
    const token = validToken();
    token.consume(new Date());
    setTokens.findByTokenHash.mockResolvedValue(token);

    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1', newPassword: 'footy2026', setToken: 'pst_rawtok' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
    expect(customers.save).not.toHaveBeenCalled();
  });

  it("rejects another customer's set_token with 400", async () => {
    customers.findById.mockResolvedValue(phoneCustomer());
    setTokens.findByTokenHash.mockResolvedValue(
      PasswordSetToken.issue('t2', 'other-customer', 'token-hash', 600, new Date()),
    );

    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1', newPassword: 'footy2026', setToken: 'pst_rawtok' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
  });

  it('rejects a weak password with 400 WEAK_PASSWORD (FR-AUTH-030)', async () => {
    customers.findById.mockResolvedValue(phoneCustomer());

    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1', newPassword: 'short', setToken: 'pst_rawtok' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
    expect(setTokens.findByTokenHash).not.toHaveBeenCalled();
  });

  it('rejects an account that already has a password with 409 PASSWORD_EXISTS (AC5)', async () => {
    customers.findById.mockResolvedValue(
      Customer.registerWithEmail('c1', 'Sabbir', 'sabbir@example.com', 'hash', false, new Date()),
    );

    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1', newPassword: 'footy2026', setToken: 'pst_rawtok' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(409);
  });

  it('rejects a request with no proof at all with 400', async () => {
    customers.findById.mockResolvedValue(phoneCustomer());

    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1', newPassword: 'footy2026' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
    expect(((thrown as HttpException).getResponse() as { code: string }).code).toBe(
      'SET_PROOF_REQUIRED',
    );
  });
});
