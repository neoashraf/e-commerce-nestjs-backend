import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { EmailVerificationToken } from '../../domain/entities/email-verification-token.entity';
import { EMAIL_VERIFICATION_TOKEN_REPOSITORY } from '../../domain/repositories/email-verification-token.repository.interface';
import { AUTH_CONFIG, AuthConfig } from '../ports/auth-config.port';
import { NOTIFICATION_DISPATCHER } from '../ports/notification-dispatcher.port';
import { VERIFICATION_TOKEN_SERVICE } from '../ports/verification-token.port';
import { IssueEmailVerificationUseCase } from '../use-cases/issue-email-verification.use-case';

const config: AuthConfig = {
  accessTtlSeconds: 900,
  refreshTtlSeconds: 2_592_000,
  otpTtlSeconds: 300,
  otpResendCooldownSeconds: 60,
  otpHourlyCap: 5,
  otpAttemptCap: 5,
  loginMaxAttempts: 5,
  loginLockoutMinutes: 15,
  emailVerifyTtlSeconds: 86_400,
  emailVerifyResendCooldownSeconds: 60,
  passwordResetTtlSeconds: 1_800,
};

describe('Auth — IssueEmailVerificationUseCase', () => {
  let useCase: IssueEmailVerificationUseCase;
  let tokens: {
    findLatestByCustomer: jest.Mock;
    consumeOutstandingForCustomer: jest.Mock;
    save: jest.Mock;
  };
  let tokenService: { mint: jest.Mock };
  let dispatcher: { dispatchEmailVerification: jest.Mock };

  beforeEach(async () => {
    tokens = {
      findLatestByCustomer: jest.fn().mockResolvedValue(null),
      consumeOutstandingForCustomer: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
    };
    tokenService = { mint: jest.fn().mockReturnValue({ raw: 'raw-token', hash: 'hashed-token' }) };
    dispatcher = { dispatchEmailVerification: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssueEmailVerificationUseCase,
        { provide: EMAIL_VERIFICATION_TOKEN_REPOSITORY, useValue: tokens },
        { provide: VERIFICATION_TOKEN_SERVICE, useValue: tokenService },
        { provide: NOTIFICATION_DISPATCHER, useValue: dispatcher },
        { provide: AUTH_CONFIG, useValue: config },
      ],
    }).compile();
    useCase = module.get(IssueEmailVerificationUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('should mint a token, invalidate prior ones, and dispatch the email', async () => {
    await useCase.execute({ customerId: 'c1', email: 'sabbir@example.com', fullName: 'Sabbir' });

    expect(tokens.consumeOutstandingForCustomer).toHaveBeenCalledWith('c1', expect.any(Date));
    expect(tokens.save).toHaveBeenCalledTimes(1);
    expect(dispatcher.dispatchEmailVerification).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'sabbir@example.com', token: 'raw-token' }),
    );
  });

  it('should enforce the resend cooldown with 429 (AC4)', async () => {
    tokens.findLatestByCustomer.mockResolvedValue(
      EmailVerificationToken.issue('t0', 'c1', 'h', 3600, new Date()),
    );

    let thrown: unknown;
    try {
      await useCase.execute({
        customerId: 'c1',
        email: 'sabbir@example.com',
        fullName: 'Sabbir',
        enforceCooldown: true,
      });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(429);
    expect(tokens.save).not.toHaveBeenCalled();
  });

  it('should not throw when the email dispatch fails (registration must still succeed)', async () => {
    dispatcher.dispatchEmailVerification.mockRejectedValue(new Error('smtp down'));
    await expect(
      useCase.execute({ customerId: 'c1', email: 'sabbir@example.com', fullName: 'Sabbir' }),
    ).resolves.toBeUndefined();
    expect(tokens.save).toHaveBeenCalledTimes(1);
  });
});
