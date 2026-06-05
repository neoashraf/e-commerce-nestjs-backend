import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Customer } from '../../domain/entities/customer.entity';
import { CUSTOMER_REPOSITORY } from '../../domain/repositories/customer.repository.interface';
import { CreateLightweightAccountUseCase } from '../use-cases/create-lightweight-account.use-case';

describe('Auth — CreateLightweightAccountUseCase', () => {
  let useCase: CreateLightweightAccountUseCase;
  let customers: { findActiveByPhone: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    customers = {
      findActiveByPhone: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((c: Customer) => Promise.resolve(c)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateLightweightAccountUseCase,
        { provide: CUSTOMER_REPOSITORY, useValue: customers },
      ],
    }).compile();
    useCase = module.get(CreateLightweightAccountUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('creates a lightweight, unverified, password-less account for a new phone (FR-AUTH-070)', async () => {
    const result = await useCase.execute({
      fullName: 'Sabbir Ahmed',
      phone: '01712345678',
      email: 'Sabbir@Example.com',
    });

    const saved = customers.save.mock.calls[0][0] as Customer;
    expect(saved.isLightweight).toBe(true);
    expect(saved.passwordHash).toBeNull();
    expect(saved.phoneVerified).toBe(false);
    expect(saved.phone).toBe('+8801712345678'); // normalized to E.164
    expect(saved.email).toBe('sabbir@example.com'); // normalized to lowercase
    expect(saved.promoSmsOptIn).toBe(false); // default opted-out (FR-AUTH-062)
    expect(saved.promoEmailOptIn).toBe(false);
    expect(result).toEqual({
      customerId: saved.id,
      wasExisting: false,
      isLightweight: true,
    });
  });

  it('is idempotent by phone — returns the existing account without duplicating (FR-AUTH-072)', async () => {
    const existing = Customer.createLightweight(
      'c1',
      'Existing',
      '+8801712345678',
      null,
      false,
      false,
      new Date(),
    );
    customers.findActiveByPhone.mockResolvedValue(existing);

    const result = await useCase.execute({ fullName: 'Sabbir Ahmed', phone: '+8801712345678' });

    expect(customers.save).not.toHaveBeenCalled();
    expect(result).toEqual({ customerId: 'c1', wasExisting: true, isLightweight: true });
  });

  it('reports is_lightweight=false when the phone belongs to a full account (BR-AUTH-1)', async () => {
    const full = Customer.registerWithPhone('c2', 'Full Account', '+8801712345678', new Date());
    customers.findActiveByPhone.mockResolvedValue(full);

    const result = await useCase.execute({ fullName: 'Sabbir', phone: '+8801712345678' });

    expect(result).toEqual({ customerId: 'c2', wasExisting: true, isLightweight: false });
  });

  it('rejects an invalid BD mobile with 400 (AC3)', async () => {
    await expect(
      useCase.execute({ fullName: 'Sabbir', phone: '+15551234567' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(customers.save).not.toHaveBeenCalled();
  });
});
