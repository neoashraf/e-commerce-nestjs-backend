import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { AuditResult } from '../../domain/enums/audit-result.enum';
import {
  ADMIN_USER_REPOSITORY,
  IAdminUserRepository,
} from '../../domain/repositories/admin-user.repository.interface';
import { IRoleRepository, ROLE_REPOSITORY } from '../../domain/repositories/role.repository.interface';
import { AuditService } from '../services/audit.service';

export interface DeleteRoleCommand {
  actorAdminId: string;
  targetId: string;
  ipAddress?: string | null;
}

/** Delete a custom, unassigned role (FR-RBAC-024): system → 409; assigned → 409 ROLE_IN_USE. */
@Injectable()
export class DeleteRoleUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: IRoleRepository,
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: IAdminUserRepository,
    private readonly audit: AuditService,
  ) {}

  async execute(command: DeleteRoleCommand): Promise<void> {
    const now = new Date();
    const role = await this.roles.findById(command.targetId);
    if (!role) {
      throw new NotFoundException({ code: 'ROLE_NOT_FOUND', message: 'Role not found.' });
    }
    if (role.isSystem) {
      throw new ConflictException({ code: 'ROLE_IS_SYSTEM', message: 'System roles cannot be deleted.' });
    }

    const assignedCount = await this.admins.countByRoleId(role.id);
    if (assignedCount > 0) {
      throw new ConflictException({
        code: 'ROLE_IN_USE',
        message: 'This role is assigned to one or more admins.',
        assigned_count: assignedCount,
      });
    }

    await this.roles.softDeleteRole(role.id, now);

    await this.audit.record({
      actorAdminId: command.actorAdminId,
      action: 'rbac.role.delete',
      result: AuditResult.SUCCESS,
      entityType: 'Role',
      entityId: role.id,
      ipAddress: command.ipAddress ?? null,
    });
  }
}
