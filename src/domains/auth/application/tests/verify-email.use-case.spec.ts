import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Customer } from '../../domain/entities/customer.entity';
import { EmailVerificationToken } from '../../domain/entities/email-verification-token.entity';
import { CUSTOMER_REPOSITORY } from '../../domain/repositories/customer.repository.interface';
import { EMAIL_VERIFICATION_TOKEN_REPOSITORY } from '../../domain/repositories/email-verification-token.repository.interface';
import { VERIFICATION_TOKEN_SERVICE } from '../ports/verification-token.port';
import { VerifyEmailUseCase } from '../use-cases/verify-email.use-case';

describe('Auth — VerifyEmailUseCase', () => {
  let useCase: VerifyEmailUseCase;
  let tokens: { findByTokenHash: jest.Mock; save: jest.Mock };
  let customers: { findById: jest.Mock; save: jest.Mock };
  let tokenService: { hash: jest.Mock };

  beforeEach(async () => {
    tokens = { findByTokenHash: jest.fn(), save: jest.fn().mockResolvedValue(undefined) };
    customers = {
      findById: jest.fn(),
      save: jest.fn().mockImplementation((c: Customer) => Promise.resolve(c)),
    };
    tokenService = { hash: jest.fn().mockReturnValue('hash-of-raw') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VerifyEmailUseCase,
        { provide: EMAIL_VERIFICATION_TOKEN_REPOSITORY, useValue: tokens },
        { provide: CUSTOMER_REPOSITORY, useValue: customers },
        { provide: VERIFICATION_TOKEN_SERVICE, useValue: tokenService },
      ],
    }).compile();
    useCase = module.get(VerifyEmailUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('should confirm a valid token and set email_verified=true (FR-AUTH-043)', async () => {
    const token = EmailVerificationToken.issue('t1', 'c1', 'hash-of-raw', 3600, new Date());
    tokens.findByTokenHash.mockResolvedValue(token);
    const customer = Customer.registerWithEmail('c1', 'Sabbir', 'sabbir@example.com', 'h', false, new Date());
    customers.findById.mockResolvedValue(customer);

    const result = await useCase.execute({ token: 'raw' });

    expect(result.emailVerified).toBe(true);
    expect(customer.emailVerified).toBe(true);
    expect(tokens.save).toHaveBeenCalled(); // consumed
    expect(customers.save).toHaveBeenCalled();
  });

  it('should reject an unknown token with 410', async () => {
    tokens.findByTokenHash.mockResolvedValue(null);
    let thrown: unknown;
    try {
      await useCase.execute({ token: 'raw' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(410);
  });

  it('should reject an already-consumed token with 410 (FR-AUTH-043)', async () => {
    const token = EmailVerificationToken.issue('t1', 'c1', 'hash-of-raw', 3600, new Date());
    token.consume(new Date());
    tokens.findByTokenHash.mockResolvedValue(token);

    let thrown: unknown;
    try {
      await useCase.execute({ token: 'raw' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(410);
    expect(customers.save).not.toHaveBeenCalled();
  });

  it('should reject an expired token with 410', async () => {
    const past = new Date(Date.now() - 10_000);
    const token = new EmailVerificationToken('t1', 'c1', 'hash-of-raw', past, null, past);
    tokens.findByTokenHash.mockResolvedValue(token);

    let thrown: unknown;
    try {
      await useCase.execute({ token: 'raw' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(410);
  });
});
