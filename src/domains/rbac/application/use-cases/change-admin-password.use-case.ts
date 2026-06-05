import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AuditResult } from '../../domain/enums/audit-result.enum';
import { isValidAdminPassword } from '../../domain/password-policy';
import {
  ADMIN_SESSION_REPOSITORY,
  IAdminSessionRepository,
} from '../../domain/repositories/admin-session.repository.interface';
import {
  ADMIN_USER_REPOSITORY,
  IAdminUserRepository,
} from '../../domain/repositories/admin-user.repository.interface';
import { IPasswordHasher, PASSWORD_HASHER } from '../ports/password-hasher.port';
import { AuditService } from '../services/audit.service';

export interface ChangeAdminPasswordCommand {
  adminId: string;
  currentPassword: string;
  newPassword: string;
  ipAddress?: string | null;
}

/**
 * Self change-password (FR-RBAC-008): re-confirm the current password (401 on mismatch),
 * enforce the admin policy (>=10 / upper / lower / number → 400), then revoke the admin's
 * sessions (parity with reset, BR-RBAC-10). The access token lives until expiry but refresh
 * is revoked. (The admin token carries no session id, so all sessions are revoked.)
 */
@Injectable()
export class ChangeAdminPasswordUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: IAdminUserRepository,
    @Inject(ADMIN_SESSION_REPOSITORY) private readonly sessions: IAdminSessionRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    private readonly audit: AuditService,
  ) {}

  async execute(command: ChangeAdminPasswordCommand): Promise<void> {
    const now = new Date();
    const admin = await this.admins.findById(command.adminId);
    if (!admin || !admin.passwordHash) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' });
    }

    const ok = await this.hasher.compare(command.currentPassword, admin.passwordHash);
    if (!ok) {
      await this.audit.record({
        actorAdminId: admin.id,
        action: 'admin.password.change',
        result: AuditResult.DENIED,
        entityType: 'AdminUser',
        entityId: admin.id,
        ipAddress: command.ipAddress ?? null,
      });
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' });
    }

    if (!isValidAdminPassword(command.newPassword)) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: 'Password must be at least 10 characters and include upper, lower, and a number.',
      });
    }

    admin.setPassword(await this.hasher.hash(command.newPassword), now);
    await this.admins.save(admin);
    await this.sessions.revokeAllForAdmin(admin.id, now);

    await this.audit.record({
      actorAdminId: admin.id,
      action: 'admin.password.change',
      result: AuditResult.SUCCESS,
      entityType: 'AdminUser',
      entityId: admin.id,
      ipAddress: command.ipAddress ?? null,
    });
  }
}
