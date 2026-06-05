import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AdminUser } from '../../domain/entities/admin-user.entity';
import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';
import { ADMIN_SESSION_REPOSITORY } from '../../domain/repositories/admin-session.repository.interface';
import { ADMIN_USER_REPOSITORY } from '../../domain/repositories/admin-user.repository.interface';
import { AuditService } from '../services/audit.service';
import { AdminUserPolicyService } from '../services/admin-user-policy.service';
import { SuspendAdminUserUseCase } from '../use-cases/suspend-admin-user.use-case';

const admin = () =>
  new AdminUser('ad2', 'A', 'a@s.com', null, 'h', 'r1', false, null, AdminUserStatus.ACTIVE, 0, null, null, new Date(), new Date(), null);

describe('RBAC — SuspendAdminUserUseCase', () => {
  let useCase: SuspendAdminUserUseCase;
  let admins: { findById: jest.Mock; save: jest.Mock };
  let sessions: { revokeAllForAdmin: jest.Mock };
  let policy: { ensureNotSelf: jest.Mock; ensureFloorPreserved: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    admins = { findById: jest.fn(), save: jest.fn().mockImplementation((a: AdminUser) => Promise.resolve(a)) };
    sessions = { revokeAllForAdmin: jest.fn().mockResolvedValue(undefined) };
    policy = { ensureNotSelf: jest.fn(), ensureFloorPreserved: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuspendAdminUserUseCase,
        { provide: ADMIN_USER_REPOSITORY, useValue: admins },
        { provide: ADMIN_SESSION_REPOSITORY, useValue: sessions },
        { provide: AdminUserPolicyService, useValue: policy },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    useCase = module.get(SuspendAdminUserUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('suspends a target and revokes its sessions (FR-RBAC-013)', async () => {
    const a = admin();
    admins.findById.mockResolvedValue(a);

    const result = await useCase.execute({ actorAdminId: 'ad1', targetId: 'ad2' });

    expect(a.status).toBe(AdminUserStatus.SUSPENDED);
    expect(sessions.revokeAllForAdmin).toHaveBeenCalledWith('ad2', expect.any(Date));
    expect(result.status).toBe(AdminUserStatus.SUSPENDED);
  });

  it('propagates the self-action guard (403)', async () => {
    admins.findById.mockResolvedValue(admin());
    policy.ensureNotSelf.mockImplementation(() => {
      throw new ForbiddenException();
    });
    await expect(useCase.execute({ actorAdminId: 'ad2', targetId: 'ad2' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(sessions.revokeAllForAdmin).not.toHaveBeenCalled();
  });

  it('404 when the target does not exist', async () => {
    admins.findById.mockResolvedValue(null);
    await expect(useCase.execute({ actorAdminId: 'ad1', targetId: 'ghost' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
