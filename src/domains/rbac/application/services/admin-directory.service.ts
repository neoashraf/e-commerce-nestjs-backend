import { Inject, Injectable } from '@nestjs/common';

import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';
import {
  ADMIN_USER_REPOSITORY,
  IAdminUserRepository,
} from '../../domain/repositories/admin-user.repository.interface';
import { PermissionService } from './permission.service';

/** Upper bound on admin accounts resolved for a broadcast — far above any realistic admin count. */
const MAX_ADMINS = 1000;

/**
 * Read-only admin directory queries used by other modules (NOTIF) to target admins.
 * Resolution is by RBAC permission so a broadcast reaches exactly the right roles
 * (Super Admin = implicit-all via {@link PermissionService}).
 */
@Injectable()
export class AdminDirectoryService {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: IAdminUserRepository,
    private readonly permissions: PermissionService,
  ) {}

  /**
   * Active (non-suspended, non-deleted) admin ids whose role grants `permissionCode`.
   * Used by NOTIF to fan out an in-app alert to e.g. all order-permissioned admins (FR-NOTIF-070).
   */
  async findActiveAdminIdsWithPermission(permissionCode: string): Promise<string[]> {
    const { items } = await this.admins.findAll({
      status: AdminUserStatus.ACTIVE,
      page: 1,
      limit: MAX_ADMINS,
    });

    // Resolve each distinct role once — many admins typically share a few roles.
    const roleAllows = new Map<string, boolean>();
    const recipients: string[] = [];
    for (const admin of items) {
      let allowed = roleAllows.get(admin.roleId);
      if (allowed === undefined) {
        allowed = await this.permissions.hasPermission(admin.roleId, permissionCode);
        roleAllows.set(admin.roleId, allowed);
      }
      if (allowed) recipients.push(admin.id);
    }
    return recipients;
  }
}
