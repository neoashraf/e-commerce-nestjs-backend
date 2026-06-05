import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';

import { AdminUser } from '../../domain/entities/admin-user.entity';
import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';
import { SUPER_ADMIN_ROLE_NAME } from '../../domain/permission-catalog';
import {
  ADMIN_USER_REPOSITORY,
  IAdminUserRepository,
} from '../../domain/repositories/admin-user.repository.interface';
import { IRoleRepository, ROLE_REPOSITORY } from '../../domain/repositories/role.repository.interface';

/**
 * Cross-cutting invariants for admin-user management (FR-RBAC-016/017):
 *  - no self-suspend / self-delete / self-role-change;
 *  - the Super Admin Floor — at least one active Super Admin must always remain.
 */
@Injectable()
export class AdminUserPolicyService {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: IAdminUserRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: IRoleRepository,
  ) {}

  ensureNotSelf(actorId: string, targetId: string): void {
    if (actorId === targetId) {
      throw new ForbiddenException({
        code: 'SELF_ACTION_FORBIDDEN',
        message: 'You cannot perform this action on your own account.',
      });
    }
  }

  /** True when the admin currently holds the Super Admin role. */
  async isSuperAdmin(admin: AdminUser): Promise<boolean> {
    const role = await this.roles.findById(admin.roleId);
    return role?.isSuperAdmin() ?? false;
  }

  /** Block any action that would remove/demote the last active Super Admin (FR-RBAC-016). */
  async ensureFloorPreserved(target: AdminUser): Promise<void> {
    if (target.status !== AdminUserStatus.ACTIVE) return;
    if (!(await this.isSuperAdmin(target))) return;
    const superRole = await this.roles.findByName(SUPER_ADMIN_ROLE_NAME);
    if (!superRole) return;
    const activeSupers = await this.admins.countActiveByRoleId(superRole.id);
    if (activeSupers <= 1) {
      throw new ConflictException({
        code: 'SUPER_ADMIN_FLOOR',
        message: 'At least one active Super Admin must remain.',
      });
    }
  }
}
