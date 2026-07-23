import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../../auth/domain/repositories/customer.repository.interface';
import { MfaChannel } from '../../domain/enums/mfa-channel.enum';
import { MfaEnforcement } from '../../domain/enums/mfa-enforcement.enum';
import {
  CUSTOMER_MFA_REPOSITORY,
  ICustomerMfaRepository,
} from '../../domain/repositories/customer-mfa.repository.interface';
import {
  IMfaSettingsRepository,
  MFA_SETTINGS_REPOSITORY,
} from '../../domain/repositories/mfa-settings.repository.interface';
import { eligibleChannels } from '../services/mfa-channels';

export interface MyMfaStatus {
  enabled: boolean;
  preferredChannel: MfaChannel | null;
  policy: {
    enforcementMode: MfaEnforcement;
    availableChannels: MfaChannel[];
    /** First-attempt channel for both-eligible, no-preference customers (FR-MFA-036). */
    defaultChannel: MfaChannel;
  };
  eligibleChannels: MfaChannel[];
}

/** The signed-in customer's 2FA status + the effective policy they may act within (FR-MFA-035). */
@Injectable()
export class GetMyMfaUseCase {
  constructor(
    @Inject(MFA_SETTINGS_REPOSITORY) private readonly settingsRepo: IMfaSettingsRepository,
    @Inject(CUSTOMER_MFA_REPOSITORY) private readonly customerMfa: ICustomerMfaRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
  ) {}

  async execute(input: { customerId: string }): Promise<MyMfaStatus> {
    const settings = await this.settingsRepo.get();
    const customer = await this.customers.findById(input.customerId);
    if (!settings || !customer) {
      throw new NotFoundException({ code: 'MFA_UNAVAILABLE', message: 'MFA is not available.' });
    }
    const state = await this.customerMfa.findByCustomerId(input.customerId);
    const contacts = {
      email: customer.email,
      emailVerified: customer.emailVerified,
      phone: customer.phone,
      phoneVerified: customer.phoneVerified,
    };
    return {
      enabled: state?.enabled ?? false,
      preferredChannel: state?.preferredChannel ?? null,
      policy: {
        enforcementMode: settings.enforcementMode,
        availableChannels: settings.availableChannels(),
        defaultChannel: settings.defaultChannel,
      },
      eligibleChannels: eligibleChannels(settings, contacts),
    };
  }
}
