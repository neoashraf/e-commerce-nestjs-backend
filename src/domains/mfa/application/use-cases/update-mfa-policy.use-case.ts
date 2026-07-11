import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { MfaSettings } from '../../domain/entities/mfa-settings.entity';
import { MfaEnforcement } from '../../domain/enums/mfa-enforcement.enum';
import {
  IMfaSettingsRepository,
  MFA_SETTINGS_REPOSITORY,
} from '../../domain/repositories/mfa-settings.repository.interface';

export interface UpdateMfaPolicyCommand {
  smsEnabled?: boolean;
  emailEnabled?: boolean;
  enforcementMode?: MfaEnforcement;
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
      throw err;
    }

    return this.settingsRepo.save(settings);
  }
}
