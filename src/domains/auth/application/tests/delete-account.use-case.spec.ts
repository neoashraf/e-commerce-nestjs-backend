import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Customer } from '../../domain/entities/customer.entity';
import { CustomerStatus } from '../../domain/enums/customer-status.enum';
import { CUSTOMER_REPOSITORY } from '../../domain/repositories/customer.repository.interface';
import { SESSION_REPOSITORY } from '../../domain/repositories/session.repository.interface';
import { DeleteAccountUseCase } from '../use-cases/delete-account.use-case';

describe('Auth — DeleteAccountUseCase', () => {
  let useCase: DeleteAccountUseCase;
  let customers: { findById: jest.Mock; save: jest.Mock };
  let sessions: { revokeAllForCustomer: jest.Mock };

  beforeEach(async () => {
    customers = {
      findById: jest.fn(),
      save: jest.fn().mockImplementation((c: Customer) => Promise.resolve(c)),
    };
    sessions = { revokeAllForCustomer: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeleteAccountUseCase,
        { provide: CUSTOMER_REPOSITORY, useValue: customers },
        { provide: SESSION_REPOSITORY, useValue: sessions },
      ],
    }).compile();
    useCase = module.get(DeleteAccountUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('anonymizes, soft-deletes, and revokes sessions (FR-AUTH-080/081)', async () => {
    const customer = Customer.registerWithEmail('c1', 'Sabbir', 'sabbir@example.com', 'h', false, new Date());
    customers.findById.mockResolvedValue(customer);

    await useCase.execute({ customerId: 'c1', confirm: true });

    expect(customer.email).toBeNull();
    expect(customer.phone).toBe('');
    expect(customer.fullName).toBe('Deleted User');
    expect(customer.status).toBe(CustomerStatus.DELETED);
    expect(customer.deletedAt).not.toBeNull();
    expect(sessions.revokeAllForCustomer).toHaveBeenCalledWith('c1', expect.any(Date));
  });

  it('requires explicit confirmation (400 otherwise)', async () => {
    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1', confirm: false });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
    expect(customers.findById).not.toHaveBeenCalled();
  });
});
