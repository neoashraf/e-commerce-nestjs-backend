import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { AuditResult } from '../../domain/enums/audit-result.enum';
import {
  ADMIN_USER_REPOSITORY,
  IAdminUserRepository,
} from '../../domain/repositories/admin-user.repository.interface';
import { AuditService } from '../services/audit.service';
import { AdminUserStatusResult } from './suspend-admin-user.use-case';

export interface ReactivateAdminUserCommand {
  actorAdminId: string;
  targetId: string;
  ipAddress?: string | null;
}

/** Reactivate a suspended admin (FR-RBAC-014). */
@Injectable()
export class ReactivateAdminUserUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: IAdminUserRepository,
    private readonly audit: AuditService,
  ) {}

  async execute(command: ReactivateAdminUserCommand): Promise<AdminUserStatusResult> {
    const now = new Date();
    const target = await this.admins.findById(command.targetId);
    if (!target || target.deletedAt) {
      throw new NotFoundException({ code: 'ADMIN_NOT_FOUND', message: 'Admin user not found.' });
    }

    target.reactivate(now);
    const saved = await this.admins.save(target);

    await this.audit.record({
      actorAdminId: command.actorAdminId,
      action: 'admin.user.reactivate',
      result: AuditResult.SUCCESS,
      entityType: 'AdminUser',
      entityId: saved.id,
      ipAddress: command.ipAddress ?? null,
    });

    return { id: saved.id, status: saved.status };
  }
}
