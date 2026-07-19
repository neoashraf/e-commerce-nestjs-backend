import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { MfaSettings } from '../../domain/entities/mfa-settings.entity';
import { MfaChannel } from '../../domain/enums/mfa-channel.enum';
import { MfaEnforcement } from '../../domain/enums/mfa-enforcement.enum';
import {
  IMfaSettingsRepository,
  MFA_SETTINGS_REPOSITORY,
} from '../../domain/repositories/mfa-settings.repository.interface';

export interface UpdateMfaPolicyCommand {
  smsEnabled?: boolean;
  emailEnabled?: boolean;
  enforcementMode?: MfaEnforcement;
  /** First-attempt channel for both-eligible, no-preference customers (FR-MFA-036). */
  defaultChannel?: MfaChannel;
  otpTtlSeconds?: number;
  resendCooldownSeconds?: number;
  maxAttempts?: number;
  updatedBy: string | null;
}

/** Update the global MFA policy (FR-MFA-030, 031, 032). Applies to subsequent logins only. */
@Injectable()
export class UpdateMfaPolicyUseCase {
  constructor(
    @Inject(MFA_SETTINGS_REPOSITORY) private readonly settingsRepo: IMfaSettingsRepository,
  ) {}

  async execute(command: UpdateMfaPolicyCommand): Promise<MfaSettings> {
    const settings = await this.settingsRepo.get();
    if (!settings) {
      throw new NotFoundException({ code: 'MFA_POLICY_MISSING', message: 'MFA policy not initialised.' });
    }

    try {
      settings.update(
        {
          smsEnabled: command.smsEnabled,
          emailEnabled: command.emailEnabled,
          enforcementMode: command.enforcementMode,
          defaultChannel: command.defaultChannel,
          otpTtlSeconds: command.otpTtlSeconds,
          resendCooldownSeconds: command.resendCooldownSeconds,
          maxAttempts: command.maxAttempts,
        },
        command.updatedBy,
        new Date(),
      );
    } catch (err) {
      if ((err as Error).message === 'MFA_NO_CHANNEL') {
        throw new BadRequestException({
          code: 'MFA_NO_CHANNEL',
          message: 'Mandatory 2FA requires at least one delivery channel (SMS or email) enabled.',
        });
      }
      if ((err as Error).message === 'MFA_DEFAULT_CHANNEL_DISABLED') {
        // Contract 17 groups this under the same 400 MFA_NO_CHANNEL error (FR-MFA-036).
        throw new BadRequestException({
          code: 'MFA_NO_CHANNEL',
          message: 'default_channel must reference an enabled channel.',
        });
      }
      throw err;
    }

    return this.settingsRepo.save(settings);
  }
}
