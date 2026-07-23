import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Customer } from '../../domain/entities/customer.entity';
import { CUSTOMER_REPOSITORY } from '../../domain/repositories/customer.repository.interface';
import { UpdateProfileUseCase } from '../use-cases/update-profile.use-case';

describe('Auth — UpdateProfileUseCase', () => {
  let useCase: UpdateProfileUseCase;
  let customers: { findById: jest.Mock; save: jest.Mock };

  const makeCustomer = () =>
    Customer.registerWithEmail('c1', 'Sabbir', 'sabbir@example.com', 'h', false, new Date());

  beforeEach(async () => {
    customers = {
      findById: jest.fn(),
      save: jest.fn().mockImplementation((c: Customer) => Promise.resolve(c)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateProfileUseCase,
        { provide: CUSTOMER_REPOSITORY, useValue: customers },
      ],
    }).compile();
    useCase = module.get(UpdateProfileUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('updates name and persists preference toggles (FR-AUTH-040/060)', async () => {
    customers.findById.mockResolvedValue(makeCustomer());

    const { customer } = await useCase.execute({
      customerId: 'c1',
      fullName: 'Sabbir A.',
      promoSmsOptIn: true,
    });

    expect(customer.fullName).toBe('Sabbir A.');
    expect(customer.promoSmsOptIn).toBe(true);
  });

  it('never touches the email — the command no longer carries one (FR-AUTH-041, AC4)', async () => {
    customers.findById.mockResolvedValue(makeCustomer());

    const { customer } = await useCase.execute({ customerId: 'c1', fullName: 'Sabbir A.' });

    // Email add/change is only possible via the verify-before-attach pair.
    expect(customer.email).toBe('sabbir@example.com');
    expect(customer.emailVerified).toBe(false);
  });

  it('rejects a date of birth under 13 with 400', async () => {
    customers.findById.mockResolvedValue(makeCustomer());
    const recent = new Date();
    recent.setFullYear(recent.getFullYear() - 10);

    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1', dateOfBirth: recent.toISOString().slice(0, 10) });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
  });
});
