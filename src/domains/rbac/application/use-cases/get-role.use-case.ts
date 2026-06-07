import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { ALL_PERMISSION_CODES } from '../../domain/permission-catalog';
import { IRoleRepository, ROLE_REPOSITORY } from '../../domain/repositories/role.repository.interface';

export interface RoleDetail {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  updatedAt: Date;
  permissions: string[];
}

/** Role detail with its effective permission set (FR-RBAC-021). */
@Injectable()
export class GetRoleUseCase {
  constructor(@Inject(ROLE_REPOSITORY) private readonly roles: IRoleRepository) {}

  async execute(id: string): Promise<RoleDetail> {
    const role = await this.roles.findById(id);
    if (!role) {
      throw new NotFoundException({ code: 'ROLE_NOT_FOUND', message: 'Role not found.' });
    }
    const permissions = role.isSuperAdmin()
      ? [...ALL_PERMISSION_CODES]
      : await this.roles.findPermissionCodes(role.id);
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      updatedAt: role.updatedAt,
      permissions,
    };
  }
}
