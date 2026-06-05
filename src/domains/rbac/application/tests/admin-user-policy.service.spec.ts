import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AdminUser } from '../../domain/entities/admin-user.entity';
import { Role } from '../../domain/entities/role.entity';
import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';
import { SUPER_ADMIN_ROLE_NAME } from '../../domain/permission-catalog';
import { ADMIN_USER_REPOSITORY } from '../../domain/repositories/admin-user.repository.interface';
import { ROLE_REPOSITORY } from '../../domain/repositories/role.repository.interface';
import { AdminUserPolicyService } from '../services/admin-user-policy.service';

const superRole = () => new Role('super', SUPER_ADMIN_ROLE_NAME, null, true, new Date(), new Date(), null);
const plainRole = () => new Role('ord', 'Order Manager', null, true, new Date(), new Date(), null);
const adminOn = (roleId: string, status = AdminUserStatus.ACTIVE) =>
  new AdminUser('ad1', 'A', 'a@s.com', null, 'h', roleId, false, null, status, 0, null, null, new Date(), new Date(), null);

describe('RBAC — AdminUserPolicyService', () => {
  let policy: AdminUserPolicyService;
  let admins: { countActiveByRoleId: jest.Mock };
  let roles: { findById: jest.Mock; findByName: jest.Mock };

  beforeEach(async () => {
    admins = { countActiveByRoleId: jest.fn() };
    roles = { findById: jest.fn(), findByName: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUserPolicyService,
        { provide: ADMIN_USER_REPOSITORY, useValue: admins },
        { provide: ROLE_REPOSITORY, useValue: roles },
      ],
    }).compile();
    policy = module.get(AdminUserPolicyService);
  });

  afterEach(() => jest.clearAllMocks());

  it('ensureNotSelf throws 403 on self-action (FR-RBAC-017)', () => {
    expect(() => policy.ensureNotSelf('ad1', 'ad1')).toThrow(ForbiddenException);
    expect(() => policy.ensureNotSelf('ad1', 'ad2')).not.toThrow();
  });

  it('blocks removing the last active Super Admin (409 SUPER_ADMIN_FLOOR)', async () => {
    roles.findById.mockResolvedValue(superRole());
    roles.findByName.mockResolvedValue(superRole());
    admins.countActiveByRoleId.mockResolvedValue(1);

    await expect(policy.ensureFloorPreserved(adminOn('super'))).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows removal when another active Super Admin remains', async () => {
    roles.findById.mockResolvedValue(superRole());
    roles.findByName.mockResolvedValue(superRole());
    admins.countActiveByRoleId.mockResolvedValue(2);

    await expect(policy.ensureFloorPreserved(adminOn('super'))).resolves.toBeUndefined();
  });

  it('is a no-op for a non-super admin', async () => {
    roles.findById.mockResolvedValue(plainRole());
    await expect(policy.ensureFloorPreserved(adminOn('ord'))).resolves.toBeUndefined();
    expect(admins.countActiveByRoleId).not.toHaveBeenCalled();
  });
});
