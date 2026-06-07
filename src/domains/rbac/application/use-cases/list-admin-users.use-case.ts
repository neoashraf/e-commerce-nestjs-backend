import { Inject, Injectable } from '@nestjs/common';

import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';
import {
  ADMIN_USER_REPOSITORY,
  IAdminUserRepository,
} from '../../domain/repositories/admin-user.repository.interface';
import { IRoleRepository, ROLE_REPOSITORY } from '../../domain/repositories/role.repository.interface';

export interface ListAdminUsersQuery {
  status?: AdminUserStatus;
  roleId?: string;
  search?: string;
  includeDeleted?: boolean;
  page: number;
  limit: number;
}

export interface AdminUserRow {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: AdminUserStatus;
  lastLoginAt: Date | null;
}

export interface ListAdminUsersResult {
  items: AdminUserRow[];
  total: number;
  page: number;
  limit: number;
}

/** Paginated/filtered admin directory (FR-RBAC-015). Deleted excluded unless opted in. */
@Injectable()
export class ListAdminUsersUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: IAdminUserRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: IRoleRepository,
  ) {}

  async execute(query: ListAdminUsersQuery): Promise<ListAdminUsersResult> {
    const { items, total } = await this.admins.findAll(query);

    const roleNames = new Map<string, string>();
    for (const admin of items) {
      if (!roleNames.has(admin.roleId)) {
        const role = await this.roles.findById(admin.roleId);
        roleNames.set(admin.roleId, role?.name ?? 'Unknown');
      }
    }

    return {
      items: items.map((a) => ({
        id: a.id,
        fullName: a.fullName,
        email: a.email,
        role: roleNames.get(a.roleId) ?? 'Unknown',
        status: a.status,
        lastLoginAt: a.lastLoginAt,
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }
}
