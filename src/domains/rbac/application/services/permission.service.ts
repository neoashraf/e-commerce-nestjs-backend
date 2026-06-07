import { Inject, Injectable } from '@nestjs/common';

import { ALL_PERMISSION_CODES } from '../../domain/permission-catalog';
import {
  IRoleRepository,
  ROLE_REPOSITORY,
} from '../../domain/repositories/role.repository.interface';

/**
 * Resolves a role's effective permission set (FR-RBAC-031/032/033/034).
 * Super Admin is implicit-all — including future codes — so it returns the whole
 * in-code catalog rather than materialised `role_permissions` rows. Default-deny:
 * any role/code not granted is forbidden.
 */
@Injectable()
export class PermissionService {
  constructor(@Inject(ROLE_REPOSITORY) private readonly roles: IRoleRepository) {}

  async getEffectivePermissions(roleId: string): Promise<string[]> {
    const role = await this.roles.findById(roleId);
    if (!role) return [];
    if (role.isSuperAdmin()) return [...ALL_PERMISSION_CODES];
    return this.roles.findPermissionCodes(roleId);
  }

  async hasPermission(roleId: string, code: string): Promise<boolean> {
    const role = await this.roles.findById(roleId);
    if (!role) return false;
    if (role.isSuperAdmin()) return true;
    const codes = await this.roles.findPermissionCodes(roleId);
    return codes.includes(code);
  }
}
