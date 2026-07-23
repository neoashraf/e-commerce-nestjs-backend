import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Customer } from '../../domain/entities/customer.entity';
import { EmailChangeRequest } from '../../domain/entities/email-change-request.entity';
import { CUSTOMER_REPOSITORY } from '../../domain/repositories/customer.repository.interface';
import { EMAIL_CHANGE_REQUEST_REPOSITORY } from '../../domain/repositories/email-change-request.repository.interface';
import { SESSION_REPOSITORY } from '../../domain/repositories/session.repository.interface';
import { NOTIFICATION_DISPATCHER } from '../ports/notification-dispatcher.port';
import { OTP_SERVICE } from '../ports/otp-service.port';
import { ConfirmEmailChangeUseCase } from '../use-cases/confirm-email-change.use-case';

describe('Auth — ConfirmEmailChangeUseCase', () => {
  let useCase: ConfirmEmailChangeUseCase;
  let customers: { findById: jest.Mock; findActiveByEmail: jest.Mock; save: jest.Mock };
  let requests: { findById: jest.Mock; save: jest.Mock };
  let sessions: { revokeAllForCustomerExcept: jest.Mock };
  let otp: { compare: jest.Mock };
  let notifier: { dispatchEmailChangedNotice: jest.Mock };

  const makeCustomer = () => {
    const c = Customer.registerWithPhone('c1', 'Sabbir', '+8801712345678', new Date());
    c.attachVerifiedEmail('old@example.com', new Date());
    return c;
  };

  const pending = () =>
    EmailChangeRequest.issue('r1', 'c1', 'new@example.com', 'code-hash', 900, new Date());

  beforeEach(async () => {
    customers = {
      findById: jest.fn(),
      findActiveByEmail: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((c: Customer) => Promise.resolve(c)),
    };
    requests = {
      findById: jest.fn(),
      save: jest.fn().mockImplementation((r: EmailChangeRequest) => Promise.resolve(r)),
    };
    sessions = { revokeAllForCustomerExcept: jest.fn().mockResolvedValue(undefined) };
    otp = { compare: jest.fn().mockResolvedValue(true) };
    notifier = { dispatchEmailChangedNotice: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfirmEmailChangeUseCase,
        { provide: CUSTOMER_REPOSITORY, useValue: customers },
        { provide: EMAIL_CHANGE_REQUEST_REPOSITORY, useValue: requests },
        { provide: SESSION_REPOSITORY, useValue: sessions },
        { provide: OTP_SERVICE, useValue: otp },
        { provide: NOTIFICATION_DISPATCHER, useValue: notifier },
      ],
    }).compile();
    useCase = module.get(ConfirmEmailChangeUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('attaches the email already verified in one step (AC2, FR-AUTH-041)', async () => {
    const customer = makeCustomer();
    customers.findById.mockResolvedValue(customer);
    const request = pending();
    requests.findById.mockResolvedValue(request);

    const result = await useCase.execute({
      customerId: 'c1',
      requestId: 'r1',
      code: '204815',
      currentSessionId: 'sess-current',
    });

    expect(result).toEqual({ email: 'new@example.com', emailVerified: true });
    expect(customer.email).toBe('new@example.com');
    expect(customer.emailVerified).toBe(true);
    expect(request.isConsumed()).toBe(true);
  });

  it('notifies the previous address and revokes other sessions (AC3, FR-AUTH-046)', async () => {
    customers.findById.mockResolvedValue(makeCustomer());
    requests.findById.mockResolvedValue(pending());

    await useCase.execute({
      customerId: 'c1',
      requestId: 'r1',
      code: '204815',
      currentSessionId: 'sess-current',
    });

    expect(sessions.revokeAllForCustomerExcept).toHaveBeenCalledWith(
      'c1',
      'sess-current',
      expect.any(Date),
    );
    expect(notifier.dispatchEmailChangedNotice).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'old@example.com', newEmailMasked: 'n**@example.com' }),
    );
  });

  it('skips the notice when the account had no previous email', async () => {
    customers.findById.mockResolvedValue(
      Customer.registerWithPhone('c1', 'Sabbir', '+8801712345678', new Date()),
    );
    requests.findById.mockResolvedValue(pending());

    await useCase.execute({ customerId: 'c1', requestId: 'r1', code: '204815' });

    expect(notifier.dispatchEmailChangedNotice).not.toHaveBeenCalled();
  });

  it('rejects a wrong code with 400; nothing attaches (AC2)', async () => {
    const customer = makeCustomer();
    customers.findById.mockResolvedValue(customer);
    requests.findById.mockResolvedValue(pending());
    otp.compare.mockResolvedValue(false);

    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1', requestId: 'r1', code: '000000' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
    expect(customer.email).toBe('old@example.com');
    expect(customers.save).not.toHaveBeenCalled();
  });

  it('rejects an expired request with 400 (AC2, edge 16)', async () => {
    customers.findById.mockResolvedValue(makeCustomer());
    const request = new EmailChangeRequest(
      'r1',
      'c1',
      'new@example.com',
      'code-hash',
      new Date(Date.now() - 1000), // expired
      null,
      new Date(Date.now() - 16 * 60_000),
    );
    requests.findById.mockResolvedValue(request);

    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1', requestId: 'r1', code: '204815' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
  });

  it('rejects a reused (consumed) request with 400 (AC2)', async () => {
    customers.findById.mockResolvedValue(makeCustomer());
    const request = pending();
    request.consume(new Date());
    requests.findById.mockResolvedValue(request);

    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1', requestId: 'r1', code: '204815' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
  });

  it("rejects another customer's request id with 400", async () => {
    customers.findById.mockResolvedValue(makeCustomer());
    requests.findById.mockResolvedValue(
      EmailChangeRequest.issue('r2', 'other-customer', 'new@example.com', 'code-hash', 900, new Date()),
    );

    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1', requestId: 'r2', code: '204815' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
  });

  it('re-checks uniqueness at confirm: claimed meanwhile → 409, nothing attaches (AC2, edge 5)', async () => {
    const customer = makeCustomer();
    customers.findById.mockResolvedValue(customer);
    requests.findById.mockResolvedValue(pending());
    customers.findActiveByEmail.mockResolvedValue(
      Customer.registerWithEmail('c2', 'Other', 'new@example.com', 'h', false, new Date()),
    );

    let thrown: unknown;
    try {
      await useCase.execute({ customerId: 'c1', requestId: 'r1', code: '204815' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(409);
    expect(customer.email).toBe('old@example.com');
    expect(customers.save).not.toHaveBeenCalled();
    expect(sessions.revokeAllForCustomerExcept).not.toHaveBeenCalled();
  });
});
