import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuditResult } from '../../domain/enums/audit-result.enum';
import { isValidPermissionCode } from '../../domain/permission-catalog';
import { IRoleRepository, ROLE_REPOSITORY } from '../../domain/repositories/role.repository.interface';
import { AuditService } from '../services/audit.service';

export interface UpdateRoleCommand {
  actorAdminId: string;
  targetId: string;
  name?: string;
  description?: string;
  permissions?: string[];
  /** Optimistic-concurrency token: the `updated_at` the client last read (FR-RBAC-025). */
  updatedAt?: string;
  ipAddress?: string | null;
}

/**
 * Update a role (FR-RBAC-022/023/025): permissions for custom + non-Super system roles
 * (Super Admin perms → 403); system role names immutable; optimistic concurrency on a
 * stale `updated_at` → 409. Changes apply on assignees' next request (no session kill).
 */
@Injectable()
export class UpdateRoleUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: IRoleRepository,
    private readonly audit: AuditService,
  ) {}

  async execute(command: UpdateRoleCommand): Promise<{ id: string; permissionCount: number }> {
    const role = await this.roles.findById(command.targetId);
    if (!role) {
      throw new NotFoundException({ code: 'ROLE_NOT_FOUND', message: 'Role not found.' });
    }

    if (role.isSuperAdmin() && command.permissions !== undefined) {
      throw new ForbiddenException({
        code: 'SUPER_ADMIN_IMMUTABLE',
        message: 'The Super Admin role has all permissions and cannot be edited.',
      });
    }

    if (
      command.updatedAt !== undefined &&
      new Date(command.updatedAt).getTime() !== role.updatedAt.getTime()
    ) {
      throw new ConflictException({
        code: 'CONCURRENCY_CONFLICT',
        message: 'This role was changed by someone else. Reload and try again.',
      });
    }

    if (command.name !== undefined && command.name.trim() !== role.name) {
      if (role.isSystem) {
        throw new BadRequestException({
          code: 'SYSTEM_ROLE_NAME_IMMUTABLE',
          message: 'System role names cannot be changed.',
        });
      }
      const existing = await this.roles.findByName(command.name.trim());
      if (existing && existing.id !== role.id) {
        throw new BadRequestException({ code: 'DUPLICATE_ROLE_NAME', message: 'A role with this name already exists.' });
      }
      role.name = command.name.trim();
    }
    if (command.description !== undefined) {
      role.description = command.description;
    }

    await this.roles.saveRole(role);

    let permissionCount: number;
    if (command.permissions !== undefined) {
      const invalid = command.permissions.filter((c) => !isValidPermissionCode(c));
      if (invalid.length > 0) {
        throw new BadRequestException({
          code: 'INVALID_PERMISSION',
          message: `Unknown permission code(s): ${invalid.join(', ')}`,
        });
      }
      const codes = [...new Set(command.permissions)];
      await this.roles.replacePermissions(role.id, codes);
      permissionCount = codes.length;
    } else {
      permissionCount = (await this.roles.findPermissionCodes(role.id)).length;
    }

    await this.audit.record({
      actorAdminId: command.actorAdminId,
      action: 'rbac.role.update',
      result: AuditResult.SUCCESS,
      entityType: 'Role',
      entityId: role.id,
      summary: { permissionCount },
      ipAddress: command.ipAddress ?? null,
    });

    return { id: role.id, permissionCount };
  }
}
