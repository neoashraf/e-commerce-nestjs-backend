import { HttpException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Customer } from '../../domain/entities/customer.entity';
import { CUSTOMER_REPOSITORY } from '../../domain/repositories/customer.repository.interface';
import { SESSION_REPOSITORY } from '../../domain/repositories/session.repository.interface';
import { AUTH_CONFIG, AuthConfig } from '../ports/auth-config.port';
import { PASSWORD_HASHER } from '../ports/password-hasher.port';
import { TOKEN_SERVICE } from '../ports/token-service.port';
import { LoginWithEmailUseCase } from '../use-cases/login-with-email.use-case';

const config: AuthConfig = {
  accessTtlSeconds: 900,
  refreshTtlSeconds: 2_592_000,
  otpTtlSeconds: 300,
  otpResendCooldownSeconds: 60,
  otpHourlyCap: 5,
  otpAttemptCap: 5,
  loginMaxAttempts: 3,
  loginLockoutMinutes: 15,
  emailVerifyTtlSeconds: 86_400,
  emailVerifyResendCooldownSeconds: 60,
  passwordResetTtlSeconds: 1_800,
  passwordSetFreshnessSeconds: 600,
  passwordSetTokenTtlSeconds: 600,
  emailChangeTtlSeconds: 900,
  emailChangeResendCooldownSeconds: 60,
  otpDevReturn: false,
};

const customerWithPassword = (): Customer =>
  Customer.registerWithEmail('c1', 'Sabbir', 'sabbir@example.com', 'hashed-pw', false, new Date());

describe('Auth — LoginWithEmailUseCase', () => {
  let useCase: LoginWithEmailUseCase;
  let customers: { findActiveByEmail: jest.Mock; save: jest.Mock };
  let sessions: { save: jest.Mock };
  let hasher: { compare: jest.Mock };
  let tokens: { signAccessToken: jest.Mock; mintRefreshToken: jest.Mock };

  beforeEach(async () => {
    customers = {
      findActiveByEmail: jest.fn(),
      save: jest.fn().mockImplementation((c: Customer) => Promise.resolve(c)),
    };
    sessions = { save: jest.fn().mockResolvedValue(undefined) };
    hasher = { compare: jest.fn() };
    tokens = {
      signAccessToken: jest.fn().mockResolvedValue({ token: 'acc', expiresIn: 900 }),
      mintRefreshToken: jest.fn().mockReturnValue({ raw: 'rt', hash: 'rth', expiresAt: new Date() }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginWithEmailUseCase,
        { provide: CUSTOMER_REPOSITORY, useValue: customers },
        { provide: SESSION_REPOSITORY, useValue: sessions },
        { provide: PASSWORD_HASHER, useValue: hasher },
        { provide: TOKEN_SERVICE, useValue: tokens },
        { provide: AUTH_CONFIG, useValue: config },
      ],
    }).compile();
    useCase = module.get(LoginWithEmailUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('should issue tokens on valid credentials and clear the failed counter (FR-AUTH-011)', async () => {
    const customer = customerWithPassword();
    customer.failedLoginAttempts = 2;
    customers.findActiveByEmail.mockResolvedValue(customer);
    hasher.compare.mockResolvedValue(true);

    const result = await useCase.execute({ email: 'sabbir@example.com', password: 'footy2026' });

    if (result.mfaRequired) throw new Error('expected a non-MFA login');
    expect(result.tokens.accessToken).toBe('acc');
    expect(sessions.save).toHaveBeenCalledTimes(1);
    expect(customer.failedLoginAttempts).toBe(0);
  });

  it('should return 401 (no enumeration) for an unknown email', async () => {
    customers.findActiveByEmail.mockResolvedValue(null);
    await expect(
      useCase.execute({ email: 'nobody@example.com', password: 'x' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('should return 401 for a phone-only account with no password', async () => {
    const phoneOnly = Customer.registerWithPhone('c2', 'Phone User', '+8801712345678', new Date());
    customers.findActiveByEmail.mockResolvedValue(phoneOnly);
    await expect(useCase.execute({ email: 'x@x.com', password: 'x' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('should lock the account after N consecutive failures and return 423 with retry_after (FR-AUTH-012)', async () => {
    const customer = customerWithPassword();
    customers.findActiveByEmail.mockResolvedValue(customer);
    hasher.compare.mockResolvedValue(false);

    // first 2 failures → still 401
    await expect(useCase.execute({ email: 'sabbir@example.com', password: 'x' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(useCase.execute({ email: 'sabbir@example.com', password: 'x' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // 3rd failure hits the threshold → 423
    let thrown: unknown;
    try {
      await useCase.execute({ email: 'sabbir@example.com', password: 'x' });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(HttpException);
    expect((thrown as HttpException).getStatus()).toBe(423);
    const body = (thrown as HttpException).getResponse() as { code: string; retry_after: number };
    expect(body.code).toBe('ACCOUNT_LOCKED');
    expect(body.retry_after).toBeGreaterThan(0);
  });

  it('should reject a login while locked without checking the password', async () => {
    const customer = customerWithPassword();
    customer.lockedUntil = new Date(Date.now() + 60_000);
    customers.findActiveByEmail.mockResolvedValue(customer);

    await expect(
      useCase.execute({ email: 'sabbir@example.com', password: 'footy2026' }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(hasher.compare).not.toHaveBeenCalled();
  });
});
