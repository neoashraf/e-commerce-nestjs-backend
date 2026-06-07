import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { AuditResult } from '../../domain/enums/audit-result.enum';
import {
  ADMIN_SESSION_REPOSITORY,
  IAdminSessionRepository,
} from '../../domain/repositories/admin-session.repository.interface';
import {
  ADMIN_USER_REPOSITORY,
  IAdminUserRepository,
} from '../../domain/repositories/admin-user.repository.interface';
import { AuditService } from '../services/audit.service';
import { AdminUserPolicyService } from '../services/admin-user-policy.service';

export interface DeleteAdminUserCommand {
  actorAdminId: string;
  targetId: string;
  ipAddress?: string | null;
}

/** Soft-delete an admin (FR-RBAC-015/016/017): floor + self-action guarded; sessions revoked. */
@Injectable()
export class DeleteAdminUserUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: IAdminUserRepository,
    @Inject(ADMIN_SESSION_REPOSITORY) private readonly sessions: IAdminSessionRepository,
    private readonly policy: AdminUserPolicyService,
    private readonly audit: AuditService,
  ) {}

  async execute(command: DeleteAdminUserCommand): Promise<void> {
    const now = new Date();
    const target = await this.admins.findById(command.targetId);
    if (!target || target.deletedAt) {
      throw new NotFoundException({ code: 'ADMIN_NOT_FOUND', message: 'Admin user not found.' });
    }

    this.policy.ensureNotSelf(command.actorAdminId, target.id);
    await this.policy.ensureFloorPreserved(target);

    target.softDelete(now);
    await this.admins.save(target);
    await this.sessions.revokeAllForAdmin(target.id, now);

    await this.audit.record({
      actorAdminId: command.actorAdminId,
      action: 'admin.user.delete',
      result: AuditResult.SUCCESS,
      entityType: 'AdminUser',
      entityId: target.id,
      ipAddress: command.ipAddress ?? null,
    });
  }
}
