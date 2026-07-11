import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { MfaSettings } from '../../domain/entities/mfa-settings.entity';
import {
  IMfaSettingsRepository,
  MFA_SETTINGS_REPOSITORY,
} from '../../domain/repositories/mfa-settings.repository.interface';

/** Read the global MFA policy (FR-MFA-030). */
@Injectable()
export class GetMfaPolicyUseCase {
  constructor(
    @Inject(MFA_SETTINGS_REPOSITORY) private readonly settingsRepo: IMfaSettingsRepository,
  ) {}

  async execute(): Promise<MfaSettings> {
    const settings = await this.settingsRepo.get();
    if (!settings) {
      throw new NotFoundException({ code: 'MFA_POLICY_MISSING', message: 'MFA policy not initialised.' });
    }
    return settings;
  }
}
