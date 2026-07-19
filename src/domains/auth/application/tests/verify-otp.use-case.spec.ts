import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Customer } from '../../domain/entities/customer.entity';
import { OtpChallenge } from '../../domain/entities/otp-challenge.entity';
import { OtpPurpose } from '../../domain/enums/otp-purpose.enum';
import { CUSTOMER_REPOSITORY } from '../../domain/repositories/customer.repository.interface';
import { OTP_CHALLENGE_REPOSITORY } from '../../domain/repositories/otp-challenge.repository.interface';
import { SESSION_REPOSITORY } from '../../domain/repositories/session.repository.interface';
import { AUTH_CONFIG } from '../ports/auth-config.port';
import { GUEST_ORDER_CLAIM_PORT } from '../ports/guest-order-claim.port';
import { OTP_SERVICE } from '../ports/otp-service.port';
import { TOKEN_SERVICE } from '../ports/token-service.port';
import { VerifyOtpUseCase } from '../use-cases/verify-otp.use-case';

/**
 * AUTH hardening test-track (auth-hardening-test AC2/AC5): OTP purpose binding on
 * the login door (BR-AUTH-3 — a password_reset/password_set/phone_change code can
 * never log in), the FR-AUTH-037 freshness marker on OTP sessions, and the legacy
 * guest-order claim sweep that must never block a login (FR-AUTH-071).
 */
describe('Auth — VerifyOtpUseCase (purpose binding + claim sweep)', () => {
  let useCase: VerifyOtpUseCase;
  let challenges: { findById: jest.Mock; save: jest.Mock };
  let customers: { findActiveByPhone: jest.Mock; save: jest.Mock };
  let sessions: { save: jest.Mock };
  let otp: { compare: jest.Mock };
  let guestOrderClaim: { claimByPhone: jest.Mock };

  const challengeWith = (purpose: OtpPurpose) =>
    OtpChallenge.issue('ch1', '+8801712345678', 'otp-hash', purpose, 300, new Date());

  beforeEach(async () => {
    challenges = {
      findById: jest.fn(),
      save: jest.fn().mockImplementation((c: OtpChallenge) => Promise.resolve(c)),
    };
    customers = {
      findActiveByPhone: jest
        .fn()
        .mockResolvedValue(Customer.registerWithPhone('c1', 'Sabbir', '+8801712345678', new Date())),
      save: jest.fn().mockImplementation((c: Customer) => Promise.resolve(c)),
    };
    sessions = { save: jest.fn().mockImplementation((s) => Promise.resolve(s)) };
    otp = { compare: jest.fn().mockResolvedValue(true) };
    guestOrderClaim = { claimByPhone: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VerifyOtpUseCase,
        { provide: OTP_CHALLENGE_REPOSITORY, useValue: challenges },
        { provide: CUSTOMER_REPOSITORY, useValue: customers },
        { provide: SESSION_REPOSITORY, useValue: sessions },
        { provide: OTP_SERVICE, useValue: otp },
        {
          provide: TOKEN_SERVICE,
          useValue: {
            signAccessToken: jest.fn().mockResolvedValue({ token: 'access', expiresIn: 900 }),
            mintRefreshToken: jest
              .fn()
              .mockReturnValue({ raw: 'refresh', hash: 'rt-hash', expiresAt: new Date(Date.now() + 1000_000) }),
          },
        },
        { provide: AUTH_CONFIG, useValue: { otpAttemptCap: 5 } },
        { provide: GUEST_ORDER_CLAIM_PORT, useValue: guestOrderClaim },
      ],
    }).compile();
    useCase = module.get(VerifyOtpUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it.each([OtpPurpose.PASSWORD_RESET, OtpPurpose.PASSWORD_SET, OtpPurpose.PHONE_CHANGE])(
    'rejects a %s-purpose code at the login door with 400 (BR-AUTH-3)',
    async (purpose) => {
      challenges.findById.mockResolvedValue(challengeWith(purpose));

      let thrown: unknown;
      try {
        await useCase.execute({ challengeId: 'ch1', code: '482913' });
      } catch (e) {
        thrown = e;
      }
      expect((thrown as HttpException).getStatus()).toBe(400);
      expect(sessions.save).not.toHaveBeenCalled();
    },
  );

  it('a LOGIN code logs in and stamps the session otpVerifiedAt (FR-AUTH-037)', async () => {
    challenges.findById.mockResolvedValue(challengeWith(OtpPurpose.LOGIN));

    const result = await useCase.execute({ challengeId: 'ch1', code: '482913' });

    expect(result.customer.id).toBe('c1');
    const session = sessions.save.mock.calls[0][0] as { otpVerifiedAt: Date | null };
    expect(session.otpVerifiedAt).toBeInstanceOf(Date);
  });

  it('runs the legacy guest-order claim sweep and never fails the login on its errors (FR-AUTH-071)', async () => {
    challenges.findById.mockResolvedValue(challengeWith(OtpPurpose.LOGIN));
    guestOrderClaim.claimByPhone.mockResolvedValue(undefined);

    await useCase.execute({ challengeId: 'ch1', code: '482913' });
    expect(guestOrderClaim.claimByPhone).toHaveBeenCalledWith('+8801712345678', 'c1');
  });
});
