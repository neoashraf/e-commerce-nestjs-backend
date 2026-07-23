import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Customer } from '../../domain/entities/customer.entity';
import { EmailChangeRequest } from '../../domain/entities/email-change-request.entity';
import { CUSTOMER_REPOSITORY } from '../../domain/repositories/customer.repository.interface';
import { EMAIL_CHANGE_REQUEST_REPOSITORY } from '../../domain/repositories/email-change-request.repository.interface';
import { AUTH_CONFIG } from '../ports/auth-config.port';
import { NOTIFICATION_DISPATCHER } from '../ports/notification-dispatcher.port';
import { OTP_SERVICE } from '../ports/otp-service.port';
import { maskEmail, RequestEmailChangeUseCase } from '../use-cases/request-email-change.use-case';

describe('Auth — RequestEmailChangeUseCase', () => {
  let useCase: RequestEmailChangeUseCase;
  let customers: { findById: jest.Mock; findActiveByEmail: jest.Mock };
  let requests: {
    findLatestByCustomer: jest.Mock;
    consumeOutstandingForCustomer: jest.Mock;
    save: jest.Mock;
  };
  let otp: { generateCode: jest.Mock; hash: jest.Mock };
  let dispatcher: { dispatchEmailChangeCode: jest.Mock };

  const config = { emailChangeTtlSeconds: 900, emailChangeResendCooldownSeconds: 60 };

  const makeCustomer = () =>
    Customer.registerWithPhone('c1', 'Sabbir', '+8801712345678', new Date());

  beforeEach(async () => {
    customers = { findById: jest.fn(), findActiveByEmail: jest.fn().mockResolvedValue(null) };
    requests = {
      findLatestByCustomer: jest.fn().mockResolvedValue(null),
      consumeOutstandingForCustomer: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockImplementation((r: EmailChangeRequest) => Promise.resolve(r)),
    };
    otp = { generateCode: jest.fn().mockReturnValue('204815'), hash: jest.fn().mockResolvedValue('code-hash') };
    dispatcher = { dispatchEmailChangeCode: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestEmailChangeUseCase,
        { provide: CUSTOMER_REPOSITORY, useValue: customers },
        { provide: EMAIL_CHANGE_REQUEST_REPOSITORY, useValue: requests },
        { provide: OTP_SERVICE, useValue: otp },
        { provide: NOTIFICATION_DISPATCHER, useValue: dispatcher },
        { provide: AUTH_CONFIG, useValue: config },
      ],
    }).compile();
    useCase = module.get(RequestEmailChangeUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('stores a pending request + dispatches the code — account row untouched (AC1)', async () => {
    const customer = makeCustomer();
    customers.findById.mockResolvedValue(customer);

    const result = await useCase.execute({ customerId: 'c1', newEmail: 'New@Example.com' });

    expect(result.requestId).toBeDefined();
    expect(result.sentTo).toBe('n**@example.com');
    expect(result.expiresIn).toBe(900);
    const saved = requests.save.mock.calls[0][0] as EmailChangeRequest;
    expect(saved.newEmail).toBe('new@example.com'); // normalized
    expect(saved.tokenHash).toBe('code-hash');
    expect(dispatcher.dispatchEmailChangeCode).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com', code: '204815' }),
    );
    // The customer row is never written by the request step.
    expect(customer.email).toBeNull();
  });

  it('rejects an address owned by another account with 409 (AC1, FR-AUTH-044)', async () => {
    customers.findById.mockResolvedValue(makeCustomer());
    customers.findActiveByEmail.mockResolvedValue(
      Customer.registerWithEmail('c2', 'Other', 'new@example.com', 'h', false, new Date()),
    );

    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1', newEmail: 'new@example.com' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(409);
    expect(requests.save).not.toHaveBeenCalled();
  });

  it('enforces the request cooldown with 429 (AC1)', async () => {
    customers.findById.mockResolvedValue(makeCustomer());
    requests.findLatestByCustomer.mockResolvedValue(
      EmailChangeRequest.issue('r0', 'c1', 'old@example.com', 'h', 900, new Date()),
    );

    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1', newEmail: 'new@example.com' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(429);
  });

  it('re-requesting your own current address is allowed (same account)', async () => {
    const customer = makeCustomer();
    customer.attachVerifiedEmail('mine@example.com', new Date());
    customers.findById.mockResolvedValue(customer);
    customers.findActiveByEmail.mockResolvedValue(customer);

    const result = await useCase.execute({ customerId: 'c1', newEmail: 'mine@example.com' });
    expect(result.requestId).toBeDefined();
  });

  it('masks emails per the contract shape', () => {
    expect(maskEmail('new@example.com')).toBe('n**@example.com');
    expect(maskEmail('a@b.co')).toBe('a**@b.co');
  });
});
