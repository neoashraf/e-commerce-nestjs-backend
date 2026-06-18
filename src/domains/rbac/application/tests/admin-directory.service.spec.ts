import { Test, TestingModule } from '@nestjs/testing';

import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';
import { ADMIN_USER_REPOSITORY } from '../../domain/repositories/admin-user.repository.interface';
import { AdminDirectoryService } from '../services/admin-directory.service';
import { PermissionService } from '../services/permission.service';

describe('RBAC — AdminDirectoryService', () => {
  let service: AdminDirectoryService;
  let admins: { findAll: jest.Mock };
  let permissions: { hasPermission: jest.Mock };

  beforeEach(async () => {
    admins = { findAll: jest.fn() };
    permissions = { hasPermission: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminDirectoryService,
        { provide: ADMIN_USER_REPOSITORY, useValue: admins },
        { provide: PermissionService, useValue: permissions },
      ],
    }).compile();

    service = module.get(AdminDirectoryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('requests only ACTIVE admins and returns those whose role grants the permission', async () => {
    admins.findAll.mockResolvedValue({
      items: [
        { id: 'super', roleId: 'role_super' },
        { id: 'order_mgr', roleId: 'role_order' },
        { id: 'catalog_mgr', roleId: 'role_catalog' },
      ],
      total: 3,
    });
    permissions.hasPermission.mockImplementation((roleId: string) =>
      Promise.resolve(roleId === 'role_super' || roleId === 'role_order'),
    );

    const ids = await service.findActiveAdminIdsWithPermission('orders.order.read');

    expect(admins.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ status: AdminUserStatus.ACTIVE }),
    );
    expect(ids).toEqual(['super', 'order_mgr']);
  });

  it('resolves each distinct role only once (admins sharing a role reuse the lookup)', async () => {
    admins.findAll.mockResolvedValue({
      items: [
        { id: 'a1', roleId: 'role_order' },
        { id: 'a2', roleId: 'role_order' },
        { id: 'a3', roleId: 'role_order' },
      ],
      total: 3,
    });
    permissions.hasPermission.mockResolvedValue(true);

    const ids = await service.findActiveAdminIdsWithPermission('orders.order.read');

    expect(ids).toEqual(['a1', 'a2', 'a3']);
    expect(permissions.hasPermission).toHaveBeenCalledTimes(1);
  });

  it('returns an empty set when no active admin holds the permission', async () => {
    admins.findAll.mockResolvedValue({ items: [{ id: 'a1', roleId: 'role_catalog' }], total: 1 });
    permissions.hasPermission.mockResolvedValue(false);
    await expect(service.findActiveAdminIdsWithPermission('orders.order.read')).resolves.toEqual([]);
  });
});
