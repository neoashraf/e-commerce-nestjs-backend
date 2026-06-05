import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Role } from '../../domain/entities/role.entity';
import { ADMIN_USER_REPOSITORY } from '../../domain/repositories/admin-user.repository.interface';
import { ROLE_REPOSITORY } from '../../domain/repositories/role.repository.interface';
import { AuditService } from '../services/audit.service';
import { DeleteRoleUseCase } from '../use-cases/delete-role.use-case';

const customRole = () => new Role('r1', 'Junior Catalog', null, false, new Date(), new Date(), null);
const systemRole = () => new Role('ro', 'Order Manager', null, true, new Date(), new Date(), null);

describe('RBAC — DeleteRoleUseCase', () => {
  let useCase: DeleteRoleUseCase;
  let roles: { findById: jest.Mock; softDeleteRole: jest.Mock };
  let admins: { countByRoleId: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    roles = { findById: jest.fn(), softDeleteRole: jest.fn().mockResolvedValue(undefined) };
    admins = { countByRoleId: jest.fn() };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeleteRoleUseCase,
        { provide: ROLE_REPOSITORY, useValue: roles },
        { provide: ADMIN_USER_REPOSITORY, useValue: admins },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    useCase = module.get(DeleteRoleUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('soft-deletes a custom unassigned role (FR-RBAC-024)', async () => {
    roles.findById.mockResolvedValue(customRole());
    admins.countByRoleId.mockResolvedValue(0);
    await useCase.execute({ actorAdminId: 'ad1', targetId: 'r1' });
    expect(roles.softDeleteRole).toHaveBeenCalledWith('r1', expect.any(Date));
  });

  it('rejects deleting an assigned role with 409 ROLE_IN_USE', async () => {
    roles.findById.mockResolvedValue(customRole());
    admins.countByRoleId.mockResolvedValue(3);
    await expect(useCase.execute({ actorAdminId: 'ad1', targetId: 'r1' })).rejects.toBeInstanceOf(ConflictException);
    expect(roles.softDeleteRole).not.toHaveBeenCalled();
  });

  it('rejects deleting a system role with 409', async () => {
    roles.findById.mockResolvedValue(systemRole());
    await expect(useCase.execute({ actorAdminId: 'ad1', targetId: 'ro' })).rejects.toBeInstanceOf(ConflictException);
  });
});
