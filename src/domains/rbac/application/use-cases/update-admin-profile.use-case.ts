import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import { AdminUser } from '../../domain/entities/admin-user.entity';
import { AuditResult } from '../../domain/enums/audit-result.enum';
import {
  ADMIN_USER_REPOSITORY,
  IAdminUserRepository,
} from '../../domain/repositories/admin-user.repository.interface';
import { AuditService } from '../services/audit.service';

export interface UpdateAdminProfileCommand {
  adminId: string;
  fullName?: string;
  phone?: string;
  ipAddress?: string | null;
}

/**
 * Self profile edit (FR-RBAC-008/012): update own name/phone only. Email is immutable and
 * role is never self-mutable (BR-RBAC-9) — the DTO whitelist rejects those keys.
 */
@Injectable()
export class UpdateAdminProfileUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: IAdminUserRepository,
    private readonly audit: AuditService,
  ) {}

  async execute(command: UpdateAdminProfileCommand): Promise<AdminUser> {
    const admin = await this.admins.findById(command.adminId);
    if (!admin) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Admin not found.' });
    }

    admin.updateProfile({ fullName: command.fullName, phone: command.phone }, new Date());
    const saved = await this.admins.save(admin);

    await this.audit.record({
      actorAdminId: admin.id,
      action: 'admin.profile.update',
      result: AuditResult.SUCCESS,
      entityType: 'AdminUser',
      entityId: admin.id,
      summary: { fields: Object.keys(command).filter((k) => k !== 'adminId' && k !== 'ipAddress') },
      ipAddress: command.ipAddress ?? null,
    });

    return saved;
  }
}
