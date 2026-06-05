import { Test, TestingModule } from '@nestjs/testing';

import { Customer } from '../../domain/entities/customer.entity';
import { CUSTOMER_REPOSITORY } from '../../domain/repositories/customer.repository.interface';
import { PASSWORD_RESET_TOKEN_REPOSITORY } from '../../domain/repositories/password-reset-token.repository.interface';
import { AUTH_CONFIG } from '../ports/auth-config.port';
import { NOTIFICATION_DISPATCHER } from '../ports/notification-dispatcher.port';
import { VERIFICATION_TOKEN_SERVICE } from '../ports/verification-token.port';
import { RequestPasswordResetUseCase } from '../use-cases/request-password-reset.use-case';

describe('Auth — RequestPasswordResetUseCase', () => {
  let useCase: RequestPasswordResetUseCase;
  let customers: { findActiveByEmail: jest.Mock };
  let tokens: { consumeOutstandingForCustomer: jest.Mock; save: jest.Mock };
  let tokenService: { mint: jest.Mock };
  let dispatcher: { dispatchPasswordReset: jest.Mock };

  const config = { passwordResetTtlSeconds: 1800 };

  beforeEach(async () => {
    customers = { findActiveByEmail: jest.fn() };
    tokens = {
      consumeOutstandingForCustomer: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
    };
    tokenService = { mint: jest.fn().mockReturnValue({ raw: 'raw-token', hash: 'hash-token' }) };
    dispatcher = { dispatchPasswordReset: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestPasswordResetUseCase,
        { provide: CUSTOMER_REPOSITORY, useValue: customers },
        { provide: PASSWORD_RESET_TOKEN_REPOSITORY, useValue: tokens },
        { provide: VERIFICATION_TOKEN_SERVICE, useValue: tokenService },
        { provide: NOTIFICATION_DISPATCHER, useValue: dispatcher },
        { provide: AUTH_CONFIG, useValue: config },
      ],
    }).compile();
    useCase = module.get(RequestPasswordResetUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('issues a token and dispatches the reset email for a known account (FR-AUTH-033)', async () => {
    const customer = Customer.registerWithEmail('c1', 'Sabbir', 'sabbir@example.com', 'h', false, new Date());
    customers.findActiveByEmail.mockResolvedValue(customer);

    await useCase.execute({ email: 'sabbir@example.com' });

    expect(tokens.consumeOutstandingForCustomer).toHaveBeenCalledWith('c1', expect.any(Date));
    expect(tokens.save).toHaveBeenCalled();
    expect(dispatcher.dispatchPasswordReset).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'sabbir@example.com', token: 'raw-token' }),
    );
  });

  it('silently no-ops for an unknown email (anti-enumeration, AC1/AC4)', async () => {
    customers.findActiveByEmail.mockResolvedValue(null);

    await useCase.execute({ email: 'nobody@example.com' });

    expect(tokens.save).not.toHaveBeenCalled();
    expect(dispatcher.dispatchPasswordReset).not.toHaveBeenCalled();
  });

  it('swallows a dispatch failure so the response stays generic', async () => {
    const customer = Customer.registerWithEmail('c1', 'Sabbir', 'sabbir@example.com', 'h', false, new Date());
    customers.findActiveByEmail.mockResolvedValue(customer);
    dispatcher.dispatchPasswordReset.mockRejectedValue(new Error('NOTIF down'));

    await expect(useCase.execute({ email: 'sabbir@example.com' })).resolves.toBeUndefined();
    expect(tokens.save).toHaveBeenCalled();
  });
});
