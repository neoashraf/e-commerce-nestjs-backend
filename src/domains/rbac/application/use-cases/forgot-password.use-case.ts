import { createHash, randomBytes, randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';

import { PasswordResetToken } from '../../domain/entities/password-reset-token.entity';
import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';
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

export interface ForgotPasswordCommand {
  email: string;
}

/**
 * Issues a reset link for an active admin (FR-RBAC-007). Always resolves silently —
 * the controller returns a generic success regardless, so no admin email is enumerable (§12.12).
 */
@Injectable()
export class ForgotPasswordUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: IAdminUserRepository,
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY) private readonly resets: IPasswordResetTokenRepository,
    @Inject(ADMIN_NOTIFICATION_DISPATCHER) private readonly notifier: IAdminNotificationDispatcher,
    @Inject(RBAC_CONFIG) private readonly config: RbacConfig,
  ) {}

  async execute(command: ForgotPasswordCommand): Promise<void> {
    const email = command.email.trim().toLowerCase();
    const admin = await this.admins.findByEmail(email);
    if (!admin || admin.status !== AdminUserStatus.ACTIVE) {
      return; // no enumeration, no email sent for unknown/inactive
    }

    const now = new Date();
    const raw = `prt_${randomBytes(32).toString('hex')}`;
    const token = new PasswordResetToken(
      randomUUID(),
      admin.id,
      createHash('sha256').update(raw).digest('hex'),
      new Date(now.getTime() + this.config.resetTokenTtlSeconds * 1000),
      null,
      now,
    );
    await this.resets.save(token);

    const resetUrl = `${this.config.adminPanelUrl}/reset-password?token=${raw}`;
    await this.notifier.dispatchPasswordReset({ email: admin.email, fullName: admin.fullName, resetUrl });
  }
}
