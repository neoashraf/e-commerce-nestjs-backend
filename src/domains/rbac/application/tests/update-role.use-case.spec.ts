import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Role } from '../../domain/entities/role.entity';
import { SUPER_ADMIN_ROLE_NAME } from '../../domain/permission-catalog';
import { ROLE_REPOSITORY } from '../../domain/repositories/role.repository.interface';
import { AuditService } from '../services/audit.service';
import { UpdateRoleUseCase } from '../use-cases/update-role.use-case';

const at = new Date('2026-06-03T10:02:00.000Z');
const customRole = () => new Role('r1', 'Junior Catalog', null, false, at, at, null);
const superRole = () => new Role('rs', SUPER_ADMIN_ROLE_NAME, null, true, at, at, null);
const systemRole = () => new Role('ro', 'Order Manager', null, true, at, at, null);

describe('RBAC — UpdateRoleUseCase', () => {
  let useCase: UpdateRoleUseCase;
  let roles: {
    findById: jest.Mock;
    findByName: jest.Mock;
    saveRole: jest.Mock;
    replacePermissions: jest.Mock;
    findPermissionCodes: jest.Mock;
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    roles = {
      findById: jest.fn(),
      findByName: jest.fn().mockResolvedValue(null),
      saveRole: jest.fn().mockImplementation((r: Role) => Promise.resolve(r)),
      replacePermissions: jest.fn().mockResolvedValue(undefined),
      findPermissionCodes: jest.fn().mockResolvedValue([]),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateRoleUseCase,
        { provide: ROLE_REPOSITORY, useValue: roles },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    useCase = module.get(UpdateRoleUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('updates a non-super role permission set (FR-RBAC-022)', async () => {
    roles.findById.mockResolvedValue(systemRole());
    const result = await useCase.execute({
      actorAdminId: 'ad1',
      targetId: 'ro',
      permissions: ['dashboard.view', 'orders.order.read'],
    });
    expect(result.permissionCount).toBe(2);
    expect(roles.replacePermissions).toHaveBeenCalled();
  });

  it('rejects editing Super Admin permissions with 403 (FR-RBAC-023)', async () => {
    roles.findById.mockResolvedValue(superRole());
    await expect(
      useCase.execute({ actorAdminId: 'ad1', targetId: 'rs', permissions: ['dashboard.view'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a stale updated_at with 409 (FR-RBAC-025)', async () => {
    roles.findById.mockResolvedValue(customRole());
    await expect(
      useCase.execute({
        actorAdminId: 'ad1',
        targetId: 'r1',
        permissions: ['dashboard.view'],
        updatedAt: '2020-01-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects renaming a system role with 400', async () => {
    roles.findById.mockResolvedValue(systemRole());
    await expect(
      useCase.execute({ actorAdminId: 'ad1', targetId: 'ro', name: 'Renamed' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
