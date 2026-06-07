import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Customer } from '../../domain/entities/customer.entity';
import { CUSTOMER_REPOSITORY } from '../../domain/repositories/customer.repository.interface';
import { IssueEmailVerificationUseCase } from '../use-cases/issue-email-verification.use-case';
import { UpdateProfileUseCase } from '../use-cases/update-profile.use-case';

describe('Auth — UpdateProfileUseCase', () => {
  let useCase: UpdateProfileUseCase;
  let customers: { findById: jest.Mock; findActiveByEmail: jest.Mock; save: jest.Mock };
  let issueEmailVerification: { execute: jest.Mock };

  const makeCustomer = () =>
    Customer.registerWithEmail('c1', 'Sabbir', 'sabbir@example.com', 'h', false, new Date());

  beforeEach(async () => {
    customers = {
      findById: jest.fn(),
      findActiveByEmail: jest.fn(),
      save: jest.fn().mockImplementation((c: Customer) => Promise.resolve(c)),
    };
    issueEmailVerification = { execute: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateProfileUseCase,
        { provide: CUSTOMER_REPOSITORY, useValue: customers },
        { provide: IssueEmailVerificationUseCase, useValue: issueEmailVerification },
      ],
    }).compile();
    useCase = module.get(UpdateProfileUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('updates name and persists preference toggles (FR-AUTH-040/060)', async () => {
    customers.findById.mockResolvedValue(makeCustomer());

    const { customer, emailChanged } = await useCase.execute({
      customerId: 'c1',
      fullName: 'Sabbir A.',
      promoSmsOptIn: true,
    });

    expect(customer.fullName).toBe('Sabbir A.');
    expect(customer.promoSmsOptIn).toBe(true);
    expect(emailChanged).toBe(false);
    expect(issueEmailVerification.execute).not.toHaveBeenCalled();
  });

  it('changing email resets verification and sends a new link (FR-AUTH-041)', async () => {
    customers.findById.mockResolvedValue(makeCustomer());
    customers.findActiveByEmail.mockResolvedValue(null);

    const { customer, emailChanged } = await useCase.execute({
      customerId: 'c1',
      email: 'new@example.com',
    });

    expect(emailChanged).toBe(true);
    expect(customer.email).toBe('new@example.com');
    expect(customer.emailVerified).toBe(false);
    expect(issueEmailVerification.execute).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'c1', email: 'new@example.com' }),
    );
  });

  it('rejects an email already used by another account with 409', async () => {
    customers.findById.mockResolvedValue(makeCustomer());
    customers.findActiveByEmail.mockResolvedValue(
      Customer.registerWithEmail('c2', 'Other', 'new@example.com', 'h', false, new Date()),
    );

    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1', email: 'new@example.com' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(409);
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
