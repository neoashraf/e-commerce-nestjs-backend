import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../../auth/domain/repositories/customer.repository.interface';
import { MfaChannel } from '../../domain/enums/mfa-channel.enum';
import { MfaChallengePurpose } from '../../domain/enums/mfa-challenge-purpose.enum';
import {
  IMfaSettingsRepository,
  MFA_SETTINGS_REPOSITORY,
} from '../../domain/repositories/mfa-settings.repository.interface';
import { MfaChallengeView } from '../mfa-results';
import { MfaChallengeIssuer } from '../services/mfa-challenge-issuer.service';
import { destinationFor, eligibleChannels, maskDestination } from '../services/mfa-channels';

export interface EnableMfaCommand {
  customerId: string;
  preferredChannel?: MfaChannel;
}

/** Start enabling 2FA: send a confirmation code to prove the channel works (FR-MFA-001, 003). */
@Injectable()
export class EnableMfaUseCase {
  constructor(
    @Inject(MFA_SETTINGS_REPOSITORY) private readonly settingsRepo: IMfaSettingsRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    private readonly issuer: MfaChallengeIssuer,
  ) {}

  async execute(command: EnableMfaCommand): Promise<MfaChallengeView> {
    const settings = await this.settingsRepo.get();
    const customer = await this.customers.findById(command.customerId);
    if (!settings || !customer) {
      throw new NotFoundException({ code: 'MFA_UNAVAILABLE', message: 'MFA is not available.' });
    }

    // 2FA is a second factor on password login — a passwordless account must set a password first
    // (BR-MFA-3, edge §12.10).
    if (!customer.passwordHash) {
      throw new BadRequestException({
        code: 'MFA_PASSWORD_REQUIRED',
        message: 'Set a password before enabling two-factor authentication.',
      });
    }

    const contacts = {
      email: customer.email,
      emailVerified: customer.emailVerified,
      phone: customer.phone,
      phoneVerified: customer.phoneVerified,
    };
    const eligible = eligibleChannels(settings, contacts);
    if (eligible.length === 0) {
      throw new BadRequestException({
        code: 'NO_ELIGIBLE_CHANNEL',
        message: 'Verify a phone or email on an enabled channel before enabling 2FA.',
      });
    }

    let channel = command.preferredChannel;
    if (channel) {
      if (!eligible.includes(channel)) {
        throw new BadRequestException({
          code: 'CHANNEL_NOT_AVAILABLE',
          message: 'That channel is not enabled or not verified on your account.',
        });
      }
    } else {
      // Default to email when eligible (BR-MFA-10), else the single other eligible channel.
      channel = eligible.includes(MfaChannel.EMAIL) ? MfaChannel.EMAIL : eligible[0];
    }
    const destination = destinationFor(channel, contacts) as string;

    const challenge = await this.issuer.issue({
      customerId: command.customerId,
      purpose: MfaChallengePurpose.ENABLE,
      channel,
      destination,
      ttlSeconds: settings.otpTtlSeconds,
      now: new Date(),
    });

    return {
      id: challenge.id,
      channel,
      sentTo: maskDestination(channel, destination),
      expiresIn: settings.otpTtlSeconds,
      resendAfter: settings.resendCooldownSeconds,
    };
  }
}
