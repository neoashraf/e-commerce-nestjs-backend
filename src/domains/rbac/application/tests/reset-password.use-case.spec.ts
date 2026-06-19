import { createHash } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AdminUser } from '../../domain/entities/admin-user.entity';
import { PasswordResetToken } from '../../domain/entities/password-reset-token.entity';
import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';
import { ADMIN_USER_REPOSITORY } from '../../domain/repositories/admin-user.repository.interface';
import { ADMIN_SESSION_REPOSITORY } from '../../domain/repositories/admin-session.repository.interface';
import { PASSWORD_RESET_TOKEN_REPOSITORY } from '../../domain/repositories/password-reset-token.repository.interface';
import { PASSWORD_HASHER } from '../ports/password-hasher.port';
import { AdminTokenExpiredException } from '../../../../shared/exceptions/admin-token-expired.exception';
import { ResetPasswordUseCase } from '../use-cases/reset-password.use-case';

const RAW_TOKEN = 'prt_validtoken';
const STRONG_PASSWORD = 'New-Passw0rd';

function tokenFor(adminId: string): PasswordResetToken {
  return new PasswordResetToken(
    'tok1',
    adminId,
    createHash('sha256').update(RAW_TOKEN).digest('hex'),
    new Date(Date.now() + 3600_000),
    null,
    new Date(),
  );
}

function adminWith(status: AdminUserStatus): AdminUser {
  return new AdminUser(
    'ad1',
    'New Ops',
    'newops@store.com',
    null,
    status === AdminUserStatus.PENDING ? null : 'old-hash',
    'r1',
    false,
    null,
    status,
    0,
    null,
    null,
    new Date(),
    new Date(),
    null,
  );
}

describe('RBAC — ResetPasswordUseCase', () => {
  let useCase: ResetPasswordUseCase;
  let admins: { findById: jest.Mock; save: jest.Mock };
  let sessions: { revokeAllForAdmin: jest.Mock };
  let resets: { findByTokenHash: jest.Mock; save: jest.Mock };
  let hasher: { hash: jest.Mock };

  beforeEach(async () => {
    admins = {
      findById: jest.fn(),
      save: jest.fn().mockImplementation((a: AdminUser) => Promise.resolve(a)),
    };
    sessions = { revokeAllForAdmin: jest.fn().mockResolvedValue(undefined) };
    resets = {
      findByTokenHash: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    hasher = { hash: jest.fn().mockResolvedValue('new-hash') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResetPasswordUseCase,
        { provide: ADMIN_USER_REPOSITORY, useValue: admins },
        { provide: ADMIN_SESSION_REPOSITORY, useValue: sessions },
        { provide: PASSWORD_RESET_TOKEN_REPOSITORY, useValue: resets },
        { provide: PASSWORD_HASHER, useValue: hasher },
      ],
    }).compile();
    useCase = module.get(ResetPasswordUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('accept-invitation: a pending admin who sets a password becomes active (FR-RBAC-010, §7.1)', async () => {
    const pending = adminWith(AdminUserStatus.PENDING);
    admins.findById.mockResolvedValue(pending);
    resets.findByTokenHash.mockResolvedValue(tokenFor(pending.id));

    await useCase.execute({ token: RAW_TOKEN, newPassword: STRONG_PASSWORD });

    const saved = admins.save.mock.calls[0][0] as AdminUser;
    expect(saved.status).toBe(AdminUserStatus.ACTIVE);
    expect(saved.passwordHash).toBe('new-hash');
    expect(sessions.revokeAllForAdmin).toHaveBeenCalledWith(pending.id, expect.any(Date));
  });

  it('reset-password: an active admin stays active after resetting (FR-RBAC-007)', async () => {
    const active = adminWith(AdminUserStatus.ACTIVE);
    admins.findById.mockResolvedValue(active);
    resets.findByTokenHash.mockResolvedValue(tokenFor(active.id));

    await useCase.execute({ token: RAW_TOKEN, newPassword: STRONG_PASSWORD });

    const saved = admins.save.mock.calls[0][0] as AdminUser;
    expect(saved.status).toBe(AdminUserStatus.ACTIVE);
    expect(saved.passwordHash).toBe('new-hash');
  });

  it('rejects a weak password with 400', async () => {
    await expect(useCase.execute({ token: RAW_TOKEN, newPassword: 'weak' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(admins.save).not.toHaveBeenCalled();
  });

  it('rejects an unknown/used/expired token with the token-expired error', async () => {
    resets.findByTokenHash.mockResolvedValue(null);
    await expect(
      useCase.execute({ token: RAW_TOKEN, newPassword: STRONG_PASSWORD }),
    ).rejects.toBeInstanceOf(AdminTokenExpiredException);
  });

  it('rejects a deleted admin with the token-expired error', async () => {
    const deleted = adminWith(AdminUserStatus.DELETED);
    admins.findById.mockResolvedValue(deleted);
    resets.findByTokenHash.mockResolvedValue(tokenFor(deleted.id));
    await expect(
      useCase.execute({ token: RAW_TOKEN, newPassword: STRONG_PASSWORD }),
    ).rejects.toBeInstanceOf(AdminTokenExpiredException);
  });
});
