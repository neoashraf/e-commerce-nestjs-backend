import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Customer } from '../../domain/entities/customer.entity';
import { CUSTOMER_REPOSITORY } from '../../domain/repositories/customer.repository.interface';
import { PASSWORD_HASHER } from '../ports/password-hasher.port';
import { ChangePasswordUseCase } from '../use-cases/change-password.use-case';

describe('Auth — ChangePasswordUseCase', () => {
  let useCase: ChangePasswordUseCase;
  let customers: { findById: jest.Mock; save: jest.Mock };
  let hasher: { compare: jest.Mock; hash: jest.Mock };

  const withPassword = () =>
    Customer.registerWithEmail('c1', 'Sabbir', 'sabbir@example.com', 'old-hash', false, new Date());

  beforeEach(async () => {
    customers = {
      findById: jest.fn(),
      save: jest.fn().mockImplementation((c: Customer) => Promise.resolve(c)),
    };
    hasher = { compare: jest.fn(), hash: jest.fn().mockResolvedValue('new-hash') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChangePasswordUseCase,
        { provide: CUSTOMER_REPOSITORY, useValue: customers },
        { provide: PASSWORD_HASHER, useValue: hasher },
      ],
    }).compile();
    useCase = module.get(ChangePasswordUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('changes the password when the current one matches (FR-AUTH-032)', async () => {
    const customer = withPassword();
    customers.findById.mockResolvedValue(customer);
    hasher.compare.mockResolvedValue(true);

    await useCase.execute({ customerId: 'c1', currentPassword: 'footy2026', newPassword: 'newfooty2026' });

    expect(customer.passwordHash).toBe('new-hash');
    expect(customers.save).toHaveBeenCalled();
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
