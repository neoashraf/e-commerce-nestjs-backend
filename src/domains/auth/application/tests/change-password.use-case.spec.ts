import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Customer } from '../../domain/entities/customer.entity';
import { CUSTOMER_REPOSITORY } from '../../domain/repositories/customer.repository.interface';
import { SESSION_REPOSITORY } from '../../domain/repositories/session.repository.interface';
import { NOTIFICATION_DISPATCHER } from '../ports/notification-dispatcher.port';
import { PASSWORD_HASHER } from '../ports/password-hasher.port';
import { ChangePasswordUseCase } from '../use-cases/change-password.use-case';

describe('Auth — ChangePasswordUseCase', () => {
  let useCase: ChangePasswordUseCase;
  let customers: { findById: jest.Mock; save: jest.Mock };
  let hasher: { compare: jest.Mock; hash: jest.Mock };
  let sessions: {
    findByRefreshTokenHash: jest.Mock;
    save: jest.Mock;
    revokeAllForCustomer: jest.Mock;
    revokeAllForCustomerExcept: jest.Mock;
  };
  let notifier: { dispatchPasswordChanged: jest.Mock };

  const withPassword = () =>
    Customer.registerWithEmail('c1', 'Sabbir', 'sabbir@example.com', 'old-hash', false, new Date());

  beforeEach(async () => {
    customers = {
      findById: jest.fn(),
      save: jest.fn().mockImplementation((c: Customer) => Promise.resolve(c)),
    };
    hasher = { compare: jest.fn(), hash: jest.fn().mockResolvedValue('new-hash') };
    sessions = {
      findByRefreshTokenHash: jest.fn(),
      save: jest.fn(),
      revokeAllForCustomer: jest.fn(),
      revokeAllForCustomerExcept: jest.fn().mockResolvedValue(undefined),
    };
    notifier = { dispatchPasswordChanged: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChangePasswordUseCase,
        { provide: CUSTOMER_REPOSITORY, useValue: customers },
        { provide: PASSWORD_HASHER, useValue: hasher },
        { provide: SESSION_REPOSITORY, useValue: sessions },
        { provide: NOTIFICATION_DISPATCHER, useValue: notifier },
      ],
    }).compile();
    useCase = module.get(ChangePasswordUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('changes the password when the current one matches (FR-AUTH-032)', async () => {
    const customer = withPassword();
    customers.findById.mockResolvedValue(customer);
    hasher.compare.mockResolvedValue(true);

    await useCase.execute({
      customerId: 'c1',
      currentPassword: 'footy2026',
      newPassword: 'newfooty2026',
      currentSessionId: 'sess-current',
    });

    expect(customer.passwordHash).toBe('new-hash');
    expect(customers.save).toHaveBeenCalled();
  });

  it('revokes all sessions except the current one on success (BR-AUTH-5)', async () => {
    const customer = withPassword();
    customers.findById.mockResolvedValue(customer);
    hasher.compare.mockResolvedValue(true);

    await useCase.execute({
      customerId: 'c1',
      currentPassword: 'footy2026',
      newPassword: 'newfooty2026',
      currentSessionId: 'sess-current',
    });

    expect(sessions.revokeAllForCustomerExcept).toHaveBeenCalledWith(
      'c1',
      'sess-current',
      expect.any(Date),
    );
  });

  it('dispatches password-changed notification (FR-AUTH-038)', async () => {
    const customer = withPassword();
    customers.findById.mockResolvedValue(customer);
    hasher.compare.mockResolvedValue(true);

    await useCase.execute({
      customerId: 'c1',
      currentPassword: 'footy2026',
      newPassword: 'newfooty2026',
      currentSessionId: 'sess-current',
    });

    expect(notifier.dispatchPasswordChanged).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'password_changed', fullName: 'Sabbir' }),
    );
  });

  it('rejects a wrong current password with 401', async () => {
    customers.findById.mockResolvedValue(withPassword());
    hasher.compare.mockResolvedValue(false);

    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1', currentPassword: 'wrong', newPassword: 'newfooty2026' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(401);
    expect(customers.save).not.toHaveBeenCalled();
  });

  it('rejects a weak new password with 400', async () => {
    customers.findById.mockResolvedValue(withPassword());
    hasher.compare.mockResolvedValue(true);

    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1', currentPassword: 'footy2026', newPassword: 'short' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
  });
});
