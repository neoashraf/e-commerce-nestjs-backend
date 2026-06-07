import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Customer } from '../../domain/entities/customer.entity';
import { CUSTOMER_REPOSITORY } from '../../domain/repositories/customer.repository.interface';
import { SESSION_REPOSITORY } from '../../domain/repositories/session.repository.interface';
import { PASSWORD_HASHER } from '../ports/password-hasher.port';
import { TOKEN_SERVICE } from '../ports/token-service.port';
import { IssueEmailVerificationUseCase } from '../use-cases/issue-email-verification.use-case';
import { RegisterWithEmailUseCase } from '../use-cases/register-with-email.use-case';

const baseCommand = {
  fullName: 'Sabbir Ahmed',
  email: 'Sabbir@Example.com',
  password: 'footy2026',
  promoEmailOptIn: true,
};

describe('Auth — RegisterWithEmailUseCase', () => {
  let useCase: RegisterWithEmailUseCase;
  let customers: { findActiveByEmail: jest.Mock; save: jest.Mock };
  let sessions: { save: jest.Mock };
  let hasher: { hash: jest.Mock };
  let tokens: { signAccessToken: jest.Mock; mintRefreshToken: jest.Mock };
  let issueVerification: { execute: jest.Mock };

  beforeEach(async () => {
    customers = {
      findActiveByEmail: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((c: Customer) => Promise.resolve(c)),
    };
    sessions = { save: jest.fn().mockResolvedValue(undefined) };
    hasher = { hash: jest.fn().mockResolvedValue('hashed-pw') };
    tokens = {
      signAccessToken: jest.fn().mockResolvedValue({ token: 'acc', expiresIn: 900 }),
      mintRefreshToken: jest.fn().mockReturnValue({ raw: 'rt', hash: 'rth', expiresAt: new Date() }),
    };
    issueVerification = { execute: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegisterWithEmailUseCase,
        { provide: CUSTOMER_REPOSITORY, useValue: customers },
        { provide: SESSION_REPOSITORY, useValue: sessions },
        { provide: PASSWORD_HASHER, useValue: hasher },
        { provide: TOKEN_SERVICE, useValue: tokens },
        { provide: IssueEmailVerificationUseCase, useValue: issueVerification },
      ],
    }).compile();
    useCase = module.get(RegisterWithEmailUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create an unverified customer with a hashed password and issue tokens (FR-AUTH-002/006)', async () => {
    const result = await useCase.execute({ ...baseCommand });

    expect(hasher.hash).toHaveBeenCalledWith('footy2026');
    const saved = customers.save.mock.calls[0][0] as Customer;
    expect(saved.passwordHash).toBe('hashed-pw');
    expect(saved.email).toBe('sabbir@example.com'); // normalized to lowercase
    expect(saved.emailVerified).toBe(false);
    expect(saved.promoEmailOptIn).toBe(true);
    expect(issueVerification.execute).toHaveBeenCalledTimes(1);
    expect(sessions.save).toHaveBeenCalledTimes(1);
    expect(result.customer.emailVerified).toBe(false);
    expect(result.tokens.accessToken).toBe('acc');
    expect(result.tokens.refreshToken).toBe('rt');
  });

  it('should reject a weak password with 400 (FR-AUTH-030)', async () => {
    await expect(useCase.execute({ ...baseCommand, password: 'short' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(customers.save).not.toHaveBeenCalled();
  });

  it('should reject a duplicate email with 409 (FR-AUTH-004)', async () => {
    customers.findActiveByEmail.mockResolvedValue(
      Customer.registerWithEmail('c1', 'Other', 'sabbir@example.com', 'h', false, new Date()),
    );
    await expect(useCase.execute({ ...baseCommand })).rejects.toBeInstanceOf(ConflictException);
    expect(customers.save).not.toHaveBeenCalled();
  });
});
