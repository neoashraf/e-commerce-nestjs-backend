import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { AuditResult } from '../../domain/enums/audit-result.enum';
import {
  ADMIN_USER_REPOSITORY,
  IAdminUserRepository,
} from '../../domain/repositories/admin-user.repository.interface';
import { IRoleRepository, ROLE_REPOSITORY } from '../../domain/repositories/role.repository.interface';
import { AuditService } from '../services/audit.service';
import { AdminUserPolicyService } from '../services/admin-user-policy.service';

export interface UpdateAdminUserCommand {
  actorAdminId: string;
  targetId: string;
  fullName?: string;
  phone?: string;
  roleId?: string;
  ipAddress?: string | null;
}

export interface UpdateAdminUserResult {
  id: string;
  role: string;
}

/**
 * Edit another admin (FR-RBAC-012/016/017): update name/phone/role. Email is immutable.
 * Changing one's OWN role → 403; demoting the last active Super Admin → 409.
 */
@Injectable()
export class UpdateAdminUserUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: IAdminUserRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: IRoleRepository,
    private readonly policy: AdminUserPolicyService,
    private readonly audit: AuditService,
  ) {}

  async execute(command: UpdateAdminUserCommand): Promise<UpdateAdminUserResult> {
    const now = new Date();
    const target = await this.admins.findById(command.targetId);
    if (!target || target.deletedAt) {
      throw new NotFoundException({ code: 'ADMIN_NOT_FOUND', message: 'Admin user not found.' });
    }

    const changingRole = command.roleId !== undefined && command.roleId !== target.roleId;
    if (changingRole) {
      if (command.actorAdminId === target.id) {
        throw new ForbiddenException({ code: 'SELF_ROLE_CHANGE', message: 'You cannot change your own role.' });
      }
      const newRole = await this.roles.findById(command.roleId as string);
      if (!newRole) {
        throw new NotFoundException({ code: 'ROLE_NOT_FOUND', message: 'Role not found.' });
      }
      // Demoting the last active Super Admin would breach the floor.
      await this.policy.ensureFloorPreserved(target);
      target.changeRole(command.roleId as string, now);
    }

    target.updateProfile({ fullName: command.fullName, phone: command.phone }, now);
    const saved = await this.admins.save(target);
    const role = await this.roles.findById(saved.roleId);

    await this.audit.record({
      actorAdminId: command.actorAdminId,
      action: 'admin.user.update',
      result: AuditResult.SUCCESS,
      entityType: 'AdminUser',
      entityId: saved.id,
      summary: { roleChanged: changingRole },
      ipAddress: command.ipAddress ?? null,
    });

    return { id: saved.id, role: role?.name ?? 'Unknown' };
  }
}
