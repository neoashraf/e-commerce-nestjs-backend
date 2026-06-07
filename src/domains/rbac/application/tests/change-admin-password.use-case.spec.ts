import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AdminUser } from '../../domain/entities/admin-user.entity';
import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';
import { ADMIN_SESSION_REPOSITORY } from '../../domain/repositories/admin-session.repository.interface';
import { ADMIN_USER_REPOSITORY } from '../../domain/repositories/admin-user.repository.interface';
import { PASSWORD_HASHER } from '../ports/password-hasher.port';
import { AuditService } from '../services/audit.service';
import { ChangeAdminPasswordUseCase } from '../use-cases/change-admin-password.use-case';

describe('RBAC — ChangeAdminPasswordUseCase', () => {
  let useCase: ChangeAdminPasswordUseCase;
  let admins: { findById: jest.Mock; save: jest.Mock };
  let sessions: { revokeAllForAdmin: jest.Mock };
  let hasher: { compare: jest.Mock; hash: jest.Mock };
  let audit: { record: jest.Mock };

  const admin = () =>
    new AdminUser('ad1', 'Ops', 'ops@store.com', null, 'old-hash', 'role1', false, null, AdminUserStatus.ACTIVE, 0, null, null, new Date(), new Date(), null);

  beforeEach(async () => {
    admins = { findById: jest.fn(), save: jest.fn().mockImplementation((a) => Promise.resolve(a)) };
    sessions = { revokeAllForAdmin: jest.fn().mockResolvedValue(undefined) };
    hasher = { compare: jest.fn(), hash: jest.fn().mockResolvedValue('new-hash') };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChangeAdminPasswordUseCase,
        { provide: ADMIN_USER_REPOSITORY, useValue: admins },
        { provide: ADMIN_SESSION_REPOSITORY, useValue: sessions },
        { provide: PASSWORD_HASHER, useValue: hasher },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    useCase = module.get(ChangeAdminPasswordUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('changes password and revokes sessions on correct current password (FR-RBAC-008)', async () => {
    const a = admin();
    admins.findById.mockResolvedValue(a);
    hasher.compare.mockResolvedValue(true);

    await useCase.execute({ adminId: 'ad1', currentPassword: 'S3cret-Pass', newPassword: 'N3w-Secret-Pass' });

    expect(a.passwordHash).toBe('new-hash');
    expect(sessions.revokeAllForAdmin).toHaveBeenCalledWith('ad1', expect.any(Date));
  });

  it('rejects a wrong current password with 401', async () => {
    admins.findById.mockResolvedValue(admin());
    hasher.compare.mockResolvedValue(false);
    await expect(
      useCase.execute({ adminId: 'ad1', currentPassword: 'wrong', newPassword: 'N3w-Secret-Pass' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions.revokeAllForAdmin).not.toHaveBeenCalled();
  });

  it('rejects a weak new password with 400', async () => {
    admins.findById.mockResolvedValue(admin());
    hasher.compare.mockResolvedValue(true);
    await expect(
      useCase.execute({ adminId: 'ad1', currentPassword: 'S3cret-Pass', newPassword: 'weak' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
