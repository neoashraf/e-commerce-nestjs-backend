import { RequestOtpUseCase } from '../use-cases/request-otp.use-case';
import { AuthConfig } from '../ports/auth-config.port';

describe('Auth — RequestOtpUseCase (dev OTP echo)', () => {
  const baseConfig: AuthConfig = {
    accessTtlSeconds: 900,
    refreshTtlSeconds: 2_592_000,
    otpTtlSeconds: 300,
    otpResendCooldownSeconds: 60,
    otpHourlyCap: 5,
    otpAttemptCap: 5,
    loginMaxAttempts: 5,
    loginLockoutMinutes: 15,
    emailVerifyTtlSeconds: 86_400,
    emailVerifyResendCooldownSeconds: 60,
    passwordResetTtlSeconds: 1_800,
    passwordSetFreshnessSeconds: 600,
    passwordSetTokenTtlSeconds: 600,
    otpDevReturn: false,
  };

  function makeUseCase(config: AuthConfig, dispatchFails = false) {
    const challenges = {
      findLatestByPhone: jest.fn().mockResolvedValue(null),
      countCreatedSince: jest.fn().mockResolvedValue(0),
      consumeOutstandingForPhone: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const otp = {
      generateCode: jest.fn().mockReturnValue('123456'),
      hash: jest.fn().mockResolvedValue('hashed'),
    };
    const dispatcher = {
      dispatchOtp: dispatchFails
        ? jest.fn().mockRejectedValue(new Error('no SMS gateway'))
        : jest.fn().mockResolvedValue(undefined),
    };
    const useCase = new RequestOtpUseCase(
      challenges as never,
      otp as never,
      dispatcher as never,
      config,
    );
    return { useCase, dispatcher };
  }

  it('echoes the OTP as devCode when otpDevReturn is on', async () => {
    const { useCase, dispatcher } = makeUseCase({ ...baseConfig, otpDevReturn: true });
    const result = await useCase.execute({ phone: '01712345678' });
    expect(result.devCode).toBe('123456');
    // The same code is still dispatched through NOTIF — dev echo is additive, not a replacement.
    expect(dispatcher.dispatchOtp).toHaveBeenCalledWith(
      expect.objectContaining({ code: '123456' }),
    );
  });

  it('never returns devCode when otpDevReturn is off (production-safe default)', async () => {
    const { useCase } = makeUseCase({ ...baseConfig, otpDevReturn: false });
    const result = await useCase.execute({ phone: '01712345678' });
    expect(result.devCode).toBeUndefined();
  });

  it('still returns devCode when otpDevReturn is on and SMS dispatch fails (no live gateway)', async () => {
    const { useCase } = makeUseCase({ ...baseConfig, otpDevReturn: true }, true);
    const result = await useCase.execute({ phone: '01712345678' });
    expect(result.devCode).toBe('123456');
  });

  it('fails with 503 when SMS dispatch fails and otpDevReturn is off (production)', async () => {
    const { useCase } = makeUseCase({ ...baseConfig, otpDevReturn: false }, true);
    await expect(useCase.execute({ phone: '01712345678' })).rejects.toMatchObject({
      response: { code: 'SMS_UNAVAILABLE' },
    });
  });
});
