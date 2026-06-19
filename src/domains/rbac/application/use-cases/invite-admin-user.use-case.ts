import { createHash, randomBytes, randomUUID } from 'crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { AdminUser } from '../../domain/entities/admin-user.entity';
import { PasswordResetToken } from '../../domain/entities/password-reset-token.entity';
import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';
import { AuditResult } from '../../domain/enums/audit-result.enum';
import {
  ADMIN_USER_REPOSITORY,
  IAdminUserRepository,
} from '../../domain/repositories/admin-user.repository.interface';
import {
  IPasswordResetTokenRepository,
  PASSWORD_RESET_TOKEN_REPOSITORY,
} from '../../domain/repositories/password-reset-token.repository.interface';
import { IRoleRepository, ROLE_REPOSITORY } from '../../domain/repositories/role.repository.interface';
import {
  ADMIN_NOTIFICATION_DISPATCHER,
  IAdminNotificationDispatcher,
} from '../ports/admin-notification.port';
import { RBAC_CONFIG, RbacConfig } from '../ports/rbac-config.port';
import { AuditService } from '../services/audit.service';

export interface InviteAdminUserCommand {
  actorAdminId: string;
  fullName: string;
  email: string;
  phone?: string;
  roleId: string;
  ipAddress?: string | null;
}

export interface InviteAdminUserResult {
  id: string;
  status: AdminUserStatus;
  inviteSent: boolean;
}

/**
 * Invite an admin (FR-RBAC-010/011): create a `pending` account on the given role and send
 * a set-password link via NOTIF. Duplicate email → 409; unknown role → 404.
 */
@Injectable()
export class InviteAdminUserUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: IAdminUserRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: IRoleRepository,
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY) private readonly resets: IPasswordResetTokenRepository,
    @Inject(ADMIN_NOTIFICATION_DISPATCHER) private readonly notifier: IAdminNotificationDispatcher,
    @Inject(RBAC_CONFIG) private readonly config: RbacConfig,
    private readonly audit: AuditService,
  ) {}

  async execute(command: InviteAdminUserCommand): Promise<InviteAdminUserResult> {
    const now = new Date();
    const email = command.email.trim().toLowerCase();

    if (await this.admins.findByEmail(email)) {
      throw new ConflictException({ code: 'EMAIL_IN_USE', message: 'An admin with this email already exists.' });
    }
    const role = await this.roles.findById(command.roleId);
    if (!role) {
      throw new NotFoundException({ code: 'ROLE_NOT_FOUND', message: 'Role not found.' });
    }

    const admin = await this.admins.save(
      new AdminUser(
        randomUUID(),
        command.fullName.trim(),
        email,
        command.phone ?? null,
        null,
        command.roleId,
        false,
        null,
        AdminUserStatus.PENDING,
        0,
        null,
        null,
        now,
        now,
        null,
      ),
    );

    const inviteSent = await this.sendSetPasswordLink(admin, now);

    await this.audit.record({
      actorAdminId: command.actorAdminId,
      action: 'admin.user.invite',
      result: AuditResult.SUCCESS,
      entityType: 'AdminUser',
      entityId: admin.id,
      summary: { email, roleId: command.roleId },
      ipAddress: command.ipAddress ?? null,
    });

    return { id: admin.id, status: admin.status, inviteSent };
  }

  /** Issue a single-use set-password token and dispatch the invite link via NOTIF. */
  private async sendSetPasswordLink(admin: AdminUser, now: Date): Promise<boolean> {
    const raw = `prt_${randomBytes(32).toString('hex')}`;
    await this.resets.save(
      new PasswordResetToken(
        randomUUID(),
        admin.id,
        createHash('sha256').update(raw).digest('hex'),
        new Date(now.getTime() + this.config.resetTokenTtlSeconds * 1000),
        null,
        now,
      ),
    );
    const inviteUrl = `${this.config.adminPanelUrl}/accept-invite?token=${raw}`;
    try {
      await this.notifier.dispatchAdminInvite({ email: admin.email, fullName: admin.fullName, inviteUrl });
      return true;
    } catch {
      return false;
    }
  }
}
