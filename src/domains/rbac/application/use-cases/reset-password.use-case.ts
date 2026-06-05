import { createHash } from 'crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';
import { isValidAdminPassword } from '../../domain/password-policy';
import {
  ADMIN_USER_REPOSITORY,
  IAdminUserRepository,
} from '../../domain/repositories/admin-user.repository.interface';
import {
  ADMIN_SESSION_REPOSITORY,
  IAdminSessionRepository,
} from '../../domain/repositories/admin-session.repository.interface';
import {
  IPasswordResetTokenRepository,
  PASSWORD_RESET_TOKEN_REPOSITORY,
} from '../../domain/repositories/password-reset-token.repository.interface';
import { IPasswordHasher, PASSWORD_HASHER } from '../ports/password-hasher.port';
import { AdminTokenExpiredException } from '../../../../shared/exceptions/admin-token-expired.exception';

export interface ResetPasswordCommand {
  token: string;
  newPassword: string;
}

/**
 * Sets a new policy-valid password from a single-use reset token and revokes all of
 * the admin's sessions (FR-RBAC-007, BR-RBAC-10). Bad/expired/used token → `410 GONE`.
 */
@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: IAdminUserRepository,
    @Inject(ADMIN_SESSION_REPOSITORY) private readonly sessions: IAdminSessionRepository,
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY) private readonly resets: IPasswordResetTokenRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
  ) {}

  async execute(command: ResetPasswordCommand): Promise<void> {
    if (!isValidAdminPassword(command.newPassword)) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: 'Password must be at least 10 characters with upper, lower, and number.',
      });
    }

    const now = new Date();
    const hash = createHash('sha256').update(command.token).digest('hex');
    const token = await this.resets.findByTokenHash(hash);
    if (!token || !token.isUsable(now)) {
      throw new AdminTokenExpiredException();
    }

    const admin = await this.admins.findById(token.adminUserId);
    if (!admin || admin.status === AdminUserStatus.DELETED) {
      throw new AdminTokenExpiredException();
    }

    admin.passwordHash = await this.hasher.hash(command.newPassword);
    admin.updatedAt = now;
    await this.admins.save(admin);

    token.use(now);
    await this.resets.save(token);

    // Revoke all sessions on reset (BR-RBAC-10).
    await this.sessions.revokeAllForAdmin(admin.id, now);
  }
}
