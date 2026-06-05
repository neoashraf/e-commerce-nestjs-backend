import { createHash, randomBytes, randomUUID } from 'crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';

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
import {
  ADMIN_NOTIFICATION_DISPATCHER,
  IAdminNotificationDispatcher,
} from '../ports/admin-notification.port';
import { RBAC_CONFIG, RbacConfig } from '../ports/rbac-config.port';
import { AuditService } from '../services/audit.service';

export interface ResendInviteCommand {
  actorAdminId: string;
  targetId: string;
  ipAddress?: string | null;
}

/** Resend a set-password invite (FR-RBAC-010) — only for a `pending` admin. */
@Injectable()
export class ResendInviteUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: IAdminUserRepository,
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY) private readonly resets: IPasswordResetTokenRepository,
    @Inject(ADMIN_NOTIFICATION_DISPATCHER) private readonly notifier: IAdminNotificationDispatcher,
    @Inject(RBAC_CONFIG) private readonly config: RbacConfig,
    private readonly audit: AuditService,
  ) {}

  async execute(command: ResendInviteCommand): Promise<{ id: string; inviteSent: boolean }> {
    const now = new Date();
    const target = await this.admins.findById(command.targetId);
    if (!target || target.deletedAt) {
      throw new NotFoundException({ code: 'ADMIN_NOT_FOUND', message: 'Admin user not found.' });
    }
    if (target.status !== AdminUserStatus.PENDING) {
      throw new ConflictException({
        code: 'NOT_PENDING',
        message: 'Invites can only be resent for a pending admin.',
      });
    }

    const raw = `prt_${randomBytes(32).toString('hex')}`;
    await this.resets.save(
      new PasswordResetToken(
        randomUUID(),
        target.id,
        createHash('sha256').update(raw).digest('hex'),
        new Date(now.getTime() + this.config.resetTokenTtlSeconds * 1000),
        null,
        now,
      ),
    );
    const resetUrl = `${this.config.adminPanelUrl}/reset-password?token=${raw}`;
    let inviteSent = true;
    try {
      await this.notifier.dispatchPasswordReset({ email: target.email, fullName: target.fullName, resetUrl });
    } catch {
      inviteSent = false;
    }

    await this.audit.record({
      actorAdminId: command.actorAdminId,
      action: 'admin.user.resend_invite',
      result: AuditResult.SUCCESS,
      entityType: 'AdminUser',
      entityId: target.id,
      ipAddress: command.ipAddress ?? null,
    });

    return { id: target.id, inviteSent };
  }
}
