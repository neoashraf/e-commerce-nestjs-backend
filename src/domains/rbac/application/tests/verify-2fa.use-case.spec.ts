import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AdminUser } from '../../domain/entities/admin-user.entity';
import { Role } from '../../domain/entities/role.entity';
import { TwofaChallenge } from '../../domain/entities/twofa-challenge.entity';
import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';
import { TwofaChannel } from '../../domain/enums/twofa-channel.enum';
import { TwofaPurpose } from '../../domain/enums/twofa-purpose.enum';
import { ADMIN_USER_REPOSITORY } from '../../domain/repositories/admin-user.repository.interface';
import { ROLE_REPOSITORY } from '../../domain/repositories/role.repository.interface';
import { TWOFA_CHALLENGE_REPOSITORY } from '../../domain/repositories/twofa-challenge.repository.interface';
import { ADMIN_OTP_SERVICE } from '../ports/admin-otp.port';
import { RBAC_CONFIG } from '../ports/rbac-config.port';
import { AuditService } from '../services/audit.service';
import { SessionIssuerService } from '../services/session-issuer.service';
import { Verify2faUseCase, Verify2faCommand } from '../use-cases/verify-2fa.use-case';

/**
 * Admin login second-factor verification (FR-RBAC-002, with FR-RBAC-008/009 purpose
 * binding). Covers: the happy path (consume → issue an mfa-verified session), every
 * challenge-invalidation reason (missing / wrong-purpose / consumed / expired /
 * attempts-exhausted), a wrong code (failed-attempt + audit), and the three
 * post-verify account guards (admin missing / not active / role missing).
 */
describe('RBAC — Verify2faUseCase (admin login 2FA)', () => {
  let useCase: Verify2faUseCase;
  let admins: { findById: jest.Mock; save: jest.Mock };
  let roles: { findById: jest.Mock };
  let challenges: { findById: jest.Mock; save: jest.Mock };
  let otp: { compare: jest.Mock };
  let audit: { record: jest.Mock };
  let sessionIssuer: { issueForLogin: jest.Mock };

  const TWOFA_ATTEMPT_CAP = 5;
  const issuedTokens = { accessToken: 'at', refreshToken: 'rt', expiresIn: 900 };

  const activeRole = () => new Role('role1', 'Order Manager', null, true, new Date(), new Date(), null);

  const makeAdmin = (status: AdminUserStatus = AdminUserStatus.ACTIVE) =>
    new AdminUser('ad1', 'Ops', 'ops@store.com', null, 'hash', 'role1', false, null, status, 0, null, null, new Date(), new Date(), null);

  /** A pending LOGIN challenge — valid by default; override any field to exercise a branch. */
  const makeChallenge = (o: Partial<{
    attempts: number;
    expiresAt: Date;
    consumedAt: Date | null;
    rememberDevice: boolean;
    purpose: TwofaPurpose;
  }> = {}) =>
    new TwofaChallenge(
      'ch1',
      'ad1',
      'code-hash',
      TwofaChannel.EMAIL,
      o.rememberDevice ?? false,
      o.attempts ?? 0,
      o.expiresAt ?? new Date(Date.now() + 300_000),
      o.consumedAt ?? null,
      new Date(),
      o.purpose ?? TwofaPurpose.LOGIN,
    );

  const buildCommand = (o: Partial<Verify2faCommand> = {}): Verify2faCommand => ({
    challengeId: 'ch1',
    code: '204815',
    ipAddress: '203.0.113.9',
    deviceLabel: 'Chrome on macOS',
    ...o,
  });

  beforeEach(async () => {
    admins = { findById: jest.fn(), save: jest.fn().mockImplementation((a) => Promise.resolve(a)) };
    roles = { findById: jest.fn().mockResolvedValue(activeRole()) };
    challenges = { findById: jest.fn(), save: jest.fn().mockImplementation((c) => Promise.resolve(c)) };
    otp = { compare: jest.fn().mockResolvedValue(true) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    sessionIssuer = { issueForLogin: jest.fn().mockResolvedValue(issuedTokens) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Verify2faUseCase,
        { provide: ADMIN_USER_REPOSITORY, useValue: admins },
        { provide: ROLE_REPOSITORY, useValue: roles },
        { provide: TWOFA_CHALLENGE_REPOSITORY, useValue: challenges },
        { provide: ADMIN_OTP_SERVICE, useValue: otp },
        { provide: RBAC_CONFIG, useValue: { twofaAttemptCap: TWOFA_ATTEMPT_CAP } },
        { provide: AuditService, useValue: audit },
        { provide: SessionIssuerService, useValue: sessionIssuer },
      ],
    }).compile();
    useCase = module.get(Verify2faUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  // ── Happy path ────────────────────────────────────────────────────────────
  it('verifies a valid code → consumes the challenge and issues an mfa-verified session (FR-RBAC-002)', async () => {
    const challenge = makeChallenge();
    challenges.findById.mockResolvedValue(challenge);
    admins.findById.mockResolvedValue(makeAdmin());

    const result = await useCase.execute(buildCommand());

    expect(result).toEqual({ admin: { id: 'ad1', roleName: 'Order Manager' }, tokens: issuedTokens });
    // Challenge consumed (single-use) and persisted.
    expect(challenge.consumedAt).not.toBeNull();
    expect(challenges.save).toHaveBeenCalledWith(challenge);
    // Session minted with mfaVerified = true (last arg) so the disable flow can skip the code step.
    expect(sessionIssuer.issueForLogin).toHaveBeenCalledWith('ad1', 'role1', false, 'Chrome on macOS', expect.any(Date), true);
    // Successful login registered on the admin.
    expect(admins.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'ad1' }));
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.login', result: 'success', summary: { via: '2fa' } }),
    );
  });

  it('passes rememberDevice through to the session issuer for the longer refresh TTL', async () => {
    challenges.findById.mockResolvedValue(makeChallenge({ rememberDevice: true }));
    admins.findById.mockResolvedValue(makeAdmin());

    await useCase.execute(buildCommand());

    expect(sessionIssuer.issueForLogin).toHaveBeenCalledWith('ad1', 'role1', true, expect.anything(), expect.any(Date), true);
  });

  // ── Challenge invalidation (all four reasons → 400, no code check) ──────────
  it('rejects an unknown challenge id with 400', async () => {
    challenges.findById.mockResolvedValue(null);

    await expect(useCase.execute(buildCommand())).rejects.toBeInstanceOf(BadRequestException);
    expect(otp.compare).not.toHaveBeenCalled();
    expect(sessionIssuer.issueForLogin).not.toHaveBeenCalled();
  });

  it('rejects an enable/disable code used to complete a login — purpose binding (FR-RBAC-008/009)', async () => {
    challenges.findById.mockResolvedValue(makeChallenge({ purpose: TwofaPurpose.ENABLE }));

    await expect(useCase.execute(buildCommand())).rejects.toBeInstanceOf(BadRequestException);
    // Never even compares the code — the challenge is rejected on purpose alone.
    expect(otp.compare).not.toHaveBeenCalled();
    expect(sessionIssuer.issueForLogin).not.toHaveBeenCalled();
  });

  it('rejects an already-consumed challenge with 400', async () => {
    challenges.findById.mockResolvedValue(makeChallenge({ consumedAt: new Date() }));

    await expect(useCase.execute(buildCommand())).rejects.toBeInstanceOf(BadRequestException);
    expect(otp.compare).not.toHaveBeenCalled();
  });

  it('rejects an expired challenge with 400', async () => {
    challenges.findById.mockResolvedValue(makeChallenge({ expiresAt: new Date(Date.now() - 1_000) }));

    await expect(useCase.execute(buildCommand())).rejects.toBeInstanceOf(BadRequestException);
    expect(otp.compare).not.toHaveBeenCalled();
  });

  it('rejects a challenge whose attempts are exhausted with 400', async () => {
    challenges.findById.mockResolvedValue(makeChallenge({ attempts: TWOFA_ATTEMPT_CAP }));

    await expect(useCase.execute(buildCommand())).rejects.toBeInstanceOf(BadRequestException);
    expect(otp.compare).not.toHaveBeenCalled();
  });

  // ── Wrong code ──────────────────────────────────────────────────────────────
  it('registers a failed attempt and audits FAILED_LOGIN when the code is wrong (400), leaving the challenge unconsumed', async () => {
    const challenge = makeChallenge({ attempts: 1 });
    challenges.findById.mockResolvedValue(challenge);
    otp.compare.mockResolvedValue(false);

    await expect(useCase.execute(buildCommand({ code: '000000' }))).rejects.toBeInstanceOf(BadRequestException);

    expect(challenge.attempts).toBe(2); // incremented
    expect(challenge.consumedAt).toBeNull(); // not consumed
    expect(challenges.save).toHaveBeenCalledWith(challenge);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.login.2fa',
        result: 'failed_login',
        summary: { reason: 'bad_2fa_code' },
      }),
    );
    expect(sessionIssuer.issueForLogin).not.toHaveBeenCalled();
    expect(admins.save).not.toHaveBeenCalled();
  });

  // ── Post-verify account guards (valid code, but account can't be issued) ─────
  it('throws 401 when the verified admin no longer exists — challenge still consumed', async () => {
    const challenge = makeChallenge();
    challenges.findById.mockResolvedValue(challenge);
    admins.findById.mockResolvedValue(null);

    await expect(useCase.execute(buildCommand())).rejects.toBeInstanceOf(UnauthorizedException);
    expect(challenge.consumedAt).not.toBeNull(); // consumed before the account lookup
    expect(sessionIssuer.issueForLogin).not.toHaveBeenCalled();
  });

  it('throws 401 when the admin is not active (e.g. suspended)', async () => {
    challenges.findById.mockResolvedValue(makeChallenge());
    admins.findById.mockResolvedValue(makeAdmin(AdminUserStatus.SUSPENDED));

    await expect(useCase.execute(buildCommand())).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessionIssuer.issueForLogin).not.toHaveBeenCalled();
  });

  it("throws 401 when the admin's role is missing", async () => {
    challenges.findById.mockResolvedValue(makeChallenge());
    admins.findById.mockResolvedValue(makeAdmin());
    roles.findById.mockResolvedValue(null);

    await expect(useCase.execute(buildCommand())).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessionIssuer.issueForLogin).not.toHaveBeenCalled();
  });
});
