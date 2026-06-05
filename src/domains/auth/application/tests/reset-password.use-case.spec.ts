import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Customer } from '../../domain/entities/customer.entity';
import { PasswordResetToken } from '../../domain/entities/password-reset-token.entity';
import { CUSTOMER_REPOSITORY } from '../../domain/repositories/customer.repository.interface';
import { PASSWORD_RESET_TOKEN_REPOSITORY } from '../../domain/repositories/password-reset-token.repository.interface';
import { SESSION_REPOSITORY } from '../../domain/repositories/session.repository.interface';
import { PASSWORD_HASHER } from '../ports/password-hasher.port';
import { VERIFICATION_TOKEN_SERVICE } from '../ports/verification-token.port';
import { ResetPasswordUseCase } from '../use-cases/reset-password.use-case';

describe('Auth — ResetPasswordUseCase', () => {
  let useCase: ResetPasswordUseCase;
  let tokens: { findByTokenHash: jest.Mock; save: jest.Mock };
  let customers: { findById: jest.Mock; save: jest.Mock };
  let sessions: { revokeAllForCustomer: jest.Mock };
  let tokenService: { hash: jest.Mock };
  let hasher: { hash: jest.Mock };

  beforeEach(async () => {
    tokens = { findByTokenHash: jest.fn(), save: jest.fn().mockResolvedValue(undefined) };
    customers = {
      findById: jest.fn(),
      save: jest.fn().mockImplementation((c: Customer) => Promise.resolve(c)),
    };
    sessions = { revokeAllForCustomer: jest.fn().mockResolvedValue(undefined) };
    tokenService = { hash: jest.fn().mockReturnValue('hash-of-raw') };
    hasher = { hash: jest.fn().mockResolvedValue('new-hash') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResetPasswordUseCase,
        { provide: PASSWORD_RESET_TOKEN_REPOSITORY, useValue: tokens },
        { provide: CUSTOMER_REPOSITORY, useValue: customers },
        { provide: SESSION_REPOSITORY, useValue: sessions },
        { provide: VERIFICATION_TOKEN_SERVICE, useValue: tokenService },
        { provide: PASSWORD_HASHER, useValue: hasher },
      ],
    }).compile();
    useCase = module.get(ResetPasswordUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('sets a new password, consumes the token, and revokes all sessions (FR-AUTH-035)', async () => {
    const token = PasswordResetToken.issue('t1', 'c1', 'hash-of-raw', 1800, new Date());
    tokens.findByTokenHash.mockResolvedValue(token);
    const customer = Customer.registerWithEmail('c1', 'Sabbir', 'sabbir@example.com', 'old', false, new Date());
    customers.findById.mockResolvedValue(customer);

    await useCase.execute({ token: 'raw', newPassword: 'newfooty2026' });

    expect(customer.passwordHash).toBe('new-hash');
    expect(tokens.save).toHaveBeenCalled(); // consumed
    expect(customers.save).toHaveBeenCalled();
    expect(sessions.revokeAllForCustomer).toHaveBeenCalledWith('c1', expect.any(Date));
  });

  it('rejects a weak password with 400 before touching the token', async () => {
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
});
