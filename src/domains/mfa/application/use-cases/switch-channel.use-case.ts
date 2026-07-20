import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../../auth/domain/repositories/customer.repository.interface';
import { CustomerMfa } from '../../domain/entities/customer-mfa.entity';
import { MfaChannel } from '../../domain/enums/mfa-channel.enum';
import { MfaChallengePurpose } from '../../domain/enums/mfa-challenge-purpose.enum';
import {
  CUSTOMER_MFA_REPOSITORY,
  ICustomerMfaRepository,
} from '../../domain/repositories/customer-mfa.repository.interface';
import {
  IMfaPreAuthRepository,
  MFA_PRE_AUTH_REPOSITORY,
} from '../../domain/repositories/mfa-pre-auth.repository.interface';
import {
  IMfaSettingsRepository,
  MFA_SETTINGS_REPOSITORY,
} from '../../domain/repositories/mfa-settings.repository.interface';
import { MfaChallengeView } from '../mfa-results';
import { MfaChallengeIssuer } from '../services/mfa-challenge-issuer.service';
import { destinationFor, eligibleChannels, maskDestination } from '../services/mfa-channels';
import { hashPreAuthToken } from '../services/pre-auth-token';

export interface SwitchChannelCommand {
  preAuthToken: string;
  channel: MfaChannel;
  remember?: boolean;
}

/** Send the code on a different enabled+verified channel mid-login (FR-MFA-020, 022). */
@Injectable()
export class SwitchChannelUseCase {
  constructor(
    @Inject(MFA_PRE_AUTH_REPOSITORY) private readonly preAuth: IMfaPreAuthRepository,
    @Inject(MFA_SETTINGS_REPOSITORY) private readonly settingsRepo: IMfaSettingsRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    @Inject(CUSTOMER_MFA_REPOSITORY) private readonly customerMfa: ICustomerMfaRepository,
    private readonly issuer: MfaChallengeIssuer,
  ) {}

  async execute(command: SwitchChannelCommand): Promise<MfaChallengeView> {
    const now = new Date();
    const preAuth = await this.preAuth.findByTokenHash(hashPreAuthToken(command.preAuthToken));
    if (!preAuth || !preAuth.isUsable(now)) {
      throw new UnauthorizedException({
        code: 'PRE_AUTH_INVALID',
        message: 'Your login session has expired. Please sign in again.',
      });
    }

    const settings = await this.settingsRepo.get();
    const customer = await this.customers.findById(preAuth.customerId);
    if (!settings || !customer) {
      throw new UnauthorizedException({
        code: 'PRE_AUTH_INVALID',
        message: 'Your login session has expired. Please sign in again.',
      });
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
    const destination = destinationFor(command.channel, contacts) as string;

    // A channel switch mid-login always continues a login_2fa challenge.
    const fresh = await this.issuer.issue({
      customerId: preAuth.customerId,
      purpose: MfaChallengePurpose.LOGIN_2FA,
      channel: command.channel,
      destination,
      ttlSeconds: settings.otpTtlSeconds,
      now,
    });
    preAuth.rebind(fresh.id);
    await this.preAuth.save(preAuth);

    if (command.remember) {
      const state =
        (await this.customerMfa.findByCustomerId(preAuth.customerId)) ??
        CustomerMfa.none(preAuth.customerId, now);
      state.setPreferredChannel(command.channel, now);
      await this.customerMfa.save(state);
    }

    return {
      id: fresh.id,
      channel: fresh.channel,
      sentTo: maskDestination(fresh.channel, fresh.destination),
      expiresIn: settings.otpTtlSeconds,
      resendAfter: settings.resendCooldownSeconds,
    };
  }
}
