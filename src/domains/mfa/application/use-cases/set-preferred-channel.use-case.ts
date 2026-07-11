import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../../auth/domain/repositories/customer.repository.interface';
import { CustomerMfa } from '../../domain/entities/customer-mfa.entity';
import { MfaChannel } from '../../domain/enums/mfa-channel.enum';
import {
  CUSTOMER_MFA_REPOSITORY,
  ICustomerMfaRepository,
} from '../../domain/repositories/customer-mfa.repository.interface';
import {
  IMfaSettingsRepository,
  MFA_SETTINGS_REPOSITORY,
} from '../../domain/repositories/mfa-settings.repository.interface';
import { eligibleChannels } from '../services/mfa-channels';

export interface SetPreferredChannelCommand {
  customerId: string;
  channel: MfaChannel;
}

/** Change the customer's preferred delivery channel (FR-MFA-003). */
@Injectable()
export class SetPreferredChannelUseCase {
  constructor(
    @Inject(MFA_SETTINGS_REPOSITORY) private readonly settingsRepo: IMfaSettingsRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    @Inject(CUSTOMER_MFA_REPOSITORY) private readonly customerMfa: ICustomerMfaRepository,
  ) {}

  async execute(command: SetPreferredChannelCommand): Promise<{ preferredChannel: MfaChannel }> {
    const now = new Date();
    const settings = await this.settingsRepo.get();
    const customer = await this.customers.findById(command.customerId);
    if (!settings || !customer) {
      throw new NotFoundException({ code: 'MFA_UNAVAILABLE', message: 'MFA is not available.' });
    }
    const contacts = {
      email: customer.email,
      emailVerified: customer.emailVerified,
      phone: customer.phone,
      phoneVerified: customer.phoneVerified,
    };
    if (!eligibleChannels(settings, contacts).includes(command.channel)) {
      throw new BadRequestException({
        code: 'CHANNEL_NOT_AVAILABLE',
        message: 'That channel is not enabled or not verified on your account.',
      });
    }

    const state =
      (await this.customerMfa.findByCustomerId(command.customerId)) ??
      CustomerMfa.none(command.customerId, now);
    state.setPreferredChannel(command.channel, now);
    await this.customerMfa.save(state);
    return { preferredChannel: command.channel };
  }
}
