import { Inject, Injectable } from '@nestjs/common';

import {
  ADMIN_USER_REPOSITORY,
  IAdminUserRepository,
} from '../../domain/repositories/admin-user.repository.interface';
import { IRoleRepository, ROLE_REPOSITORY } from '../../domain/repositories/role.repository.interface';

export interface RoleListRow {
  id: string;
  name: string;
  isSystem: boolean;
  assignedCount: number;
  permissionCount: number | 'all';
}

/** List roles with assigned counts + system/custom flag (FR-RBAC-020). */
@Injectable()
export class ListRolesUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: IRoleRepository,
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: IAdminUserRepository,
  ) {}

  async execute(): Promise<RoleListRow[]> {
    const roles = await this.roles.findAll();
    const rows: RoleListRow[] = [];
    for (const role of roles) {
      const assignedCount = await this.admins.countByRoleId(role.id);
      const permissionCount = role.isSuperAdmin()
        ? 'all'
        : (await this.roles.findPermissionCodes(role.id)).length;
      rows.push({
        id: role.id,
        name: role.name,
        isSystem: role.isSystem,
        assignedCount,
        permissionCount,
      });
    }
    return rows;
  }
}
