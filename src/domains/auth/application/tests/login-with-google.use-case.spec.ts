import { UnauthorizedException } from '@nestjs/common';

import { Customer } from '../../domain/entities/customer.entity';
import { LoginWithGoogleUseCase } from '../use-cases/login-with-google.use-case';
import { GoogleProfile } from '../ports/google-verifier.port';

function makeUseCase(profile: GoogleProfile | Error, existing: Customer | null) {
  const google = {
    verify: jest.fn(() => (profile instanceof Error ? Promise.reject(profile) : Promise.resolve(profile))),
  };
  const customers = {
    findActiveByEmail: jest.fn().mockResolvedValue(existing),
    save: jest.fn().mockImplementation((c: Customer) => Promise.resolve(c)),
  };
  const sessions = { save: jest.fn().mockResolvedValue(undefined) };
  const tokens = {
    signAccessToken: jest.fn().mockResolvedValue({ token: 'access', expiresIn: 900 }),
    mintRefreshToken: jest.fn().mockReturnValue({ raw: 'refresh', hash: 'h', expiresAt: new Date('2026-07-01') }),
  };
  const useCase = new LoginWithGoogleUseCase(
    google as never,
    customers as never,
    sessions as never,
    tokens as never,
  );
  return { useCase, google, customers, sessions, tokens };
}

const VERIFIED: GoogleProfile = {
  email: 'sabit@gmail.com',
  emailVerified: true,
  name: 'Sabit Vai',
  sub: 'g-123',
};

describe('Auth — LoginWithGoogleUseCase', () => {
  it('registers a new account for an unknown Google email and issues a session', async () => {
    const { useCase, customers, sessions } = makeUseCase(VERIFIED, null);
    const result = await useCase.execute({ idToken: 'tok' });

    expect(result.isNewAccount).toBe(true);
    expect(result.customer.email).toBe('sabit@gmail.com');
    expect(result.tokens.accessToken).toBe('access');
    // A fresh Google account is email-verified, has no password, and is not lightweight.
    const saved = customers.save.mock.calls[0][0] as Customer;
    expect(saved).toMatchObject({ email: 'sabit@gmail.com', emailVerified: true, passwordHash: null, isLightweight: false });
    expect(sessions.save).toHaveBeenCalledTimes(1);
  });

  it('logs in an existing account by email (no new account)', async () => {
    const existing = Customer.registerWithGoogle('c1', 'Sabit', 'sabit@gmail.com', new Date('2026-01-01'));
    const { useCase } = makeUseCase(VERIFIED, existing);
    const result = await useCase.execute({ idToken: 'tok' });

    expect(result.isNewAccount).toBe(false);
    expect(result.customer.id).toBe('c1');
  });

  it('rejects a Google token whose email is not verified (401)', async () => {
    const { useCase, customers } = makeUseCase({ ...VERIFIED, emailVerified: false }, null);
    await expect(useCase.execute({ idToken: 'tok' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(customers.save).not.toHaveBeenCalled();
  });

  it('propagates a verifier rejection (invalid/forged token)', async () => {
    const { useCase } = makeUseCase(new UnauthorizedException({ code: 'INVALID_GOOGLE_TOKEN' }), null);
    await expect(useCase.execute({ idToken: 'bad' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
