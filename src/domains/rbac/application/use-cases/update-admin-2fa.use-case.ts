import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AuditResult } from '../../domain/enums/audit-result.enum';
import { TwofaChannel } from '../../domain/enums/twofa-channel.enum';
import {
  ADMIN_USER_REPOSITORY,
  IAdminUserRepository,
} from '../../domain/repositories/admin-user.repository.interface';
import { IPasswordHasher, PASSWORD_HASHER } from '../ports/password-hasher.port';
import { AuditService } from '../services/audit.service';

export interface UpdateAdmin2faCommand {
  adminId: string;
  enabled: boolean;
  channel?: TwofaChannel;
  currentPassword: string;
  ipAddress?: string | null;
}

export interface Update2faResult {
  twofaEnabled: boolean;
  channel: TwofaChannel | null;
}

/**
 * Enable/disable own 2FA (FR-RBAC-008). Both directions re-confirm the current password.
 * Enable validates the channel (`sms` needs a stored phone). Every admin — including Super
 * Admin — controls their own 2FA (no forced-on role). NOTE: the API contract models this as a
 * single password-gated PATCH (no separate OTP-confirm endpoint), so we follow the contract over
 * the brief's optional OTP-confirm design-note.
 */
@Injectable()
export class UpdateAdmin2faUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: IAdminUserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    private readonly audit: AuditService,
  ) {}

  async execute(command: UpdateAdmin2faCommand): Promise<Update2faResult> {
    const now = new Date();
    const admin = await this.admins.findById(command.adminId);
    if (!admin || !admin.passwordHash) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' });
    }

    const ok = await this.hasher.compare(command.currentPassword, admin.passwordHash);
    if (!ok) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' });
    }

    if (command.enabled) {
      if (!command.channel) {
        throw new BadRequestException({ code: 'CHANNEL_REQUIRED', message: 'A 2FA channel is required.' });
      }
      if (command.channel === TwofaChannel.SMS && !admin.phone) {
        throw new BadRequestException({
          code: 'PHONE_REQUIRED',
          message: 'Add a phone number to your profile before enabling SMS 2FA.',
        });
      }
      admin.enableTwofa(command.channel, now);
    } else {
      // Every admin controls their own 2FA — including Super Admin (no forced-on role).
      admin.disableTwofa(now);
    }

    await this.admins.save(admin);

    await this.audit.record({
      actorAdminId: admin.id,
      action: command.enabled ? 'admin.2fa.enable' : 'admin.2fa.disable',
      result: AuditResult.SUCCESS,
      entityType: 'AdminUser',
      entityId: admin.id,
      summary: { channel: admin.twofaChannel },
      ipAddress: command.ipAddress ?? null,
    });

    return { twofaEnabled: admin.twofaEnabled, channel: admin.twofaChannel };
  }
}
