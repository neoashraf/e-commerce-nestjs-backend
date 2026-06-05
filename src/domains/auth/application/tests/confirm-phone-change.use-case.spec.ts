import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Customer } from '../../domain/entities/customer.entity';
import { OtpChallenge } from '../../domain/entities/otp-challenge.entity';
import { OtpPurpose } from '../../domain/enums/otp-purpose.enum';
import { CUSTOMER_REPOSITORY } from '../../domain/repositories/customer.repository.interface';
import { OTP_CHALLENGE_REPOSITORY } from '../../domain/repositories/otp-challenge.repository.interface';
import { AUTH_CONFIG } from '../ports/auth-config.port';
import { OTP_SERVICE } from '../ports/otp-service.port';
import { ConfirmPhoneChangeUseCase } from '../use-cases/confirm-phone-change.use-case';

describe('Auth — ConfirmPhoneChangeUseCase', () => {
  let useCase: ConfirmPhoneChangeUseCase;
  let challenges: { findById: jest.Mock; save: jest.Mock };
  let customers: { findById: jest.Mock; findActiveByPhone: jest.Mock; save: jest.Mock };
  let otp: { compare: jest.Mock };

  const config = { otpAttemptCap: 5 };
  const phoneChangeChallenge = () =>
    OtpChallenge.issue('ch1', '+8801812345678', 'otp-hash', OtpPurpose.PHONE_CHANGE, 300, new Date());

  beforeEach(async () => {
    challenges = { findById: jest.fn(), save: jest.fn().mockResolvedValue(undefined) };
    customers = {
      findById: jest.fn(),
      findActiveByPhone: jest.fn(),
      save: jest.fn().mockImplementation((c: Customer) => Promise.resolve(c)),
    };
    otp = { compare: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfirmPhoneChangeUseCase,
        { provide: OTP_CHALLENGE_REPOSITORY, useValue: challenges },
        { provide: CUSTOMER_REPOSITORY, useValue: customers },
        { provide: OTP_SERVICE, useValue: otp },
        { provide: AUTH_CONFIG, useValue: config },
      ],
    }).compile();
    useCase = module.get(ConfirmPhoneChangeUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('replaces the phone after a valid OTP (FR-AUTH-042)', async () => {
    challenges.findById.mockResolvedValue(phoneChangeChallenge());
    otp.compare.mockResolvedValue(true);
    customers.findActiveByPhone.mockResolvedValue(null);
    const customer = Customer.registerWithPhone('c1', 'Sabbir', '+8801712345678', new Date());
    customers.findById.mockResolvedValue(customer);

    const result = await useCase.execute({ customerId: 'c1', challengeId: 'ch1', code: '112233' });

    expect(result.phone).toBe('+8801812345678');
    expect(customer.phone).toBe('+8801812345678');
  });

  it('rejects an invalid OTP code', async () => {
    challenges.findById.mockResolvedValue(phoneChangeChallenge());
    otp.compare.mockResolvedValue(false);

    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1', challengeId: 'ch1', code: 'wrong' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
    expect(customers.save).not.toHaveBeenCalled();
  });

  it('rejects when the new phone now belongs to another account (409)', async () => {
    challenges.findById.mockResolvedValue(phoneChangeChallenge());
    otp.compare.mockResolvedValue(true);
    customers.findActiveByPhone.mockResolvedValue(
      Customer.registerWithPhone('c2', 'Other', '+8801812345678', new Date()),
    );

    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1', challengeId: 'ch1', code: '112233' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(409);
  });
});
