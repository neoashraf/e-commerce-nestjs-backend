import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Customer } from '../../domain/entities/customer.entity';
import { OtpChallenge } from '../../domain/entities/otp-challenge.entity';
import { PasswordResetToken } from '../../domain/entities/password-reset-token.entity';
import { OtpPurpose } from '../../domain/enums/otp-purpose.enum';
import { CUSTOMER_REPOSITORY } from '../../domain/repositories/customer.repository.interface';
import { OTP_CHALLENGE_REPOSITORY } from '../../domain/repositories/otp-challenge.repository.interface';
import { PASSWORD_RESET_TOKEN_REPOSITORY } from '../../domain/repositories/password-reset-token.repository.interface';
import { SESSION_REPOSITORY } from '../../domain/repositories/session.repository.interface';
import { AUTH_CONFIG } from '../ports/auth-config.port';
import { OTP_SERVICE } from '../ports/otp-service.port';
import { PASSWORD_HASHER } from '../ports/password-hasher.port';
import { VERIFICATION_TOKEN_SERVICE } from '../ports/verification-token.port';
import { ResetPasswordUseCase } from '../use-cases/reset-password.use-case';

describe('Auth — ResetPasswordUseCase', () => {
  let useCase: ResetPasswordUseCase;
  let tokens: { findByTokenHash: jest.Mock; save: jest.Mock };
  let challenges: { findById: jest.Mock; save: jest.Mock };
  let customers: { findById: jest.Mock; findActiveByPhone: jest.Mock; save: jest.Mock };
  let sessions: { revokeAllForCustomer: jest.Mock };
  let tokenService: { hash: jest.Mock };
  let otp: { compare: jest.Mock };
  let hasher: { hash: jest.Mock };

  const config = { otpAttemptCap: 5 };

  beforeEach(async () => {
    tokens = { findByTokenHash: jest.fn(), save: jest.fn().mockResolvedValue(undefined) };
    challenges = { findById: jest.fn(), save: jest.fn().mockResolvedValue(undefined) };
    customers = {
      findById: jest.fn(),
      findActiveByPhone: jest.fn(),
      save: jest.fn().mockImplementation((c: Customer) => Promise.resolve(c)),
    };
    sessions = { revokeAllForCustomer: jest.fn().mockResolvedValue(undefined) };
    tokenService = { hash: jest.fn().mockReturnValue('hash-of-raw') };
    otp = { compare: jest.fn() };
    hasher = { hash: jest.fn().mockResolvedValue('new-hash') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResetPasswordUseCase,
        { provide: PASSWORD_RESET_TOKEN_REPOSITORY, useValue: tokens },
        { provide: OTP_CHALLENGE_REPOSITORY, useValue: challenges },
        { provide: CUSTOMER_REPOSITORY, useValue: customers },
        { provide: SESSION_REPOSITORY, useValue: sessions },
        { provide: VERIFICATION_TOKEN_SERVICE, useValue: tokenService },
        { provide: OTP_SERVICE, useValue: otp },
        { provide: PASSWORD_HASHER, useValue: hasher },
        { provide: AUTH_CONFIG, useValue: config },
      ],
    }).compile();
    useCase = module.get(ResetPasswordUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  // ── Email path (FR-AUTH-033) ─────────────────────────────────────────────
  it('sets a new password via token, consumes it, and revokes all sessions (FR-AUTH-035)', async () => {
    const token = PasswordResetToken.issue('t1', 'c1', 'hash-of-raw', 1800, new Date());
    tokens.findByTokenHash.mockResolvedValue(token);
    const customer = Customer.registerWithEmail('c1', 'Sabbir', 'sabbir@example.com', 'old', false, new Date());
    customers.findById.mockResolvedValue(customer);

    await useCase.execute({ token: 'raw', newPassword: 'newfooty2026' });

    expect(customer.passwordHash).toBe('new-hash');
    expect(tokens.save).toHaveBeenCalled();
    expect(sessions.revokeAllForCustomer).toHaveBeenCalledWith('c1', expect.any(Date));
  });

  it('rejects a weak password with 400 before touching any proof', async () => {
    let thrown: unknown;
    try {
      await useCase.execute({ token: 'raw', newPassword: 'short' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
    expect(tokens.findByTokenHash).not.toHaveBeenCalled();
  });

  it('rejects an unknown token with 410', async () => {
    tokens.findByTokenHash.mockResolvedValue(null);
    let thrown: unknown;
    try {
      await useCase.execute({ token: 'raw', newPassword: 'newfooty2026' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(410);
    expect(sessions.revokeAllForCustomer).not.toHaveBeenCalled();
  });

  it('rejects an already-consumed token with 410', async () => {
    const token = PasswordResetToken.issue('t1', 'c1', 'hash-of-raw', 1800, new Date());
    token.consume(new Date());
    tokens.findByTokenHash.mockResolvedValue(token);

    let thrown: unknown;
    try {
      await useCase.execute({ token: 'raw', newPassword: 'newfooty2026' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(410);
    expect(customers.save).not.toHaveBeenCalled();
  });

  it('rejects an expired token with 410', async () => {
    const past = new Date(Date.now() - 10_000);
    const token = new PasswordResetToken('t1', 'c1', 'hash-of-raw', past, null, past);
    tokens.findByTokenHash.mockResolvedValue(token);

    let thrown: unknown;
    try {
      await useCase.execute({ token: 'raw', newPassword: 'newfooty2026' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(410);
  });

  // ── Phone path (FR-AUTH-034) ─────────────────────────────────────────────
  it('resets via a password_reset OTP and revokes all sessions (FR-AUTH-034/035)', async () => {
    const challenge = OtpChallenge.issue('ch1', '+8801712345678', 'otp-hash', OtpPurpose.PASSWORD_RESET, 300, new Date());
    challenges.findById.mockResolvedValue(challenge);
    otp.compare.mockResolvedValue(true);
    const customer = Customer.registerWithPhone('c1', 'Sabbir', '+8801712345678', new Date());
    customers.findActiveByPhone.mockResolvedValue(customer);

    await useCase.execute({ challengeId: 'ch1', code: '482913', newPassword: 'newfooty2026' });

    expect(customer.passwordHash).toBe('new-hash');
    expect(challenges.save).toHaveBeenCalled(); // consumed
    expect(sessions.revokeAllForCustomer).toHaveBeenCalledWith('c1', expect.any(Date));
  });

  it('rejects an OTP challenge that is not a password_reset purpose with 400', async () => {
    const challenge = OtpChallenge.issue('ch1', '+8801712345678', 'otp-hash', OtpPurpose.LOGIN, 300, new Date());
    challenges.findById.mockResolvedValue(challenge);

    let thrown: unknown;
    try {
      await useCase.execute({ challengeId: 'ch1', code: '482913', newPassword: 'newfooty2026' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
  });

  it('rejects an invalid OTP code with 400', async () => {
    const challenge = OtpChallenge.issue('ch1', '+8801712345678', 'otp-hash', OtpPurpose.PASSWORD_RESET, 300, new Date());
    challenges.findById.mockResolvedValue(challenge);
    otp.compare.mockResolvedValue(false);

    let thrown: unknown;
    try {
      await useCase.execute({ challengeId: 'ch1', code: 'wrong', newPassword: 'newfooty2026' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
    expect(customers.save).not.toHaveBeenCalled();
  });

  it('rejects when neither a token nor an OTP proof is supplied with 400', async () => {
    let thrown: unknown;
    try {
      await useCase.execute({ newPassword: 'newfooty2026' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
  });
});
