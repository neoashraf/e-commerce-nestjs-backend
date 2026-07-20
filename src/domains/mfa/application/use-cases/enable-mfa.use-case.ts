import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../../auth/domain/repositories/customer.repository.interface';
import { MfaChannel } from '../../domain/enums/mfa-channel.enum';
import { MfaChallengePurpose } from '../../domain/enums/mfa-challenge-purpose.enum';
import {
  IMfaChallengeRepository,
  MFA_CHALLENGE_REPOSITORY,
} from '../../domain/repositories/mfa-challenge.repository.interface';
import {
  IMfaSettingsRepository,
  MFA_SETTINGS_REPOSITORY,
} from '../../domain/repositories/mfa-settings.repository.interface';
import { MFA_CONFIG, MfaConfig } from '../ports/mfa-config.port';
import { MfaChallengeView } from '../mfa-results';
import { MfaChallengeIssuer } from '../services/mfa-challenge-issuer.service';
import {
  destinationFor,
  eligibleChannels,
  maskDestination,
  resolveChallengeChannel,
} from '../services/mfa-channels';

export interface EnableMfaCommand {
  customerId: string;
  preferredChannel?: MfaChannel;
}

/**
 * Start enabling 2FA: send a confirmation code to prove the channel works (FR-MFA-001, 003).
 * Subject to the same resend cooldown + hourly cap as the login challenge (FR-MFA-008) —
 * the settings path is not a code-flooding bypass.
 */
@Injectable()
export class EnableMfaUseCase {
  constructor(
    @Inject(MFA_SETTINGS_REPOSITORY) private readonly settingsRepo: IMfaSettingsRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    @Inject(MFA_CHALLENGE_REPOSITORY) private readonly challenges: IMfaChallengeRepository,
    @Inject(MFA_CONFIG) private readonly config: MfaConfig,
    private readonly issuer: MfaChallengeIssuer,
  ) {}

  async execute(command: EnableMfaCommand): Promise<MfaChallengeView> {
    const now = new Date();
    const settings = await this.settingsRepo.get();
    const customer = await this.customers.findById(command.customerId);
    if (!settings || !customer) {
      throw new NotFoundException({ code: 'MFA_UNAVAILABLE', message: 'MFA is not available.' });
    }

    // Enrollment throttling (FR-MFA-008): same cooldown + hourly cap as the login challenge.
    const latest = await this.challenges.findLatestByCustomer(command.customerId);
    if (latest) {
      const cooldown = settings.resendCooldownSeconds;
      const elapsed = (now.getTime() - latest.createdAt.getTime()) / 1000;
      if (elapsed < cooldown) {
        throw new HttpException(
          {
            code: 'MFA_COOLDOWN',
            message: 'Please wait before requesting another code.',
            retry_after: Math.ceil(cooldown - elapsed),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    const since = new Date(now.getTime() - 3600 * 1000);
    const recent = await this.challenges.countCreatedSince(command.customerId, since);
    if (recent >= this.config.resendHourlyCap) {
      throw new HttpException(
        { code: 'MFA_HOURLY_CAP', message: 'Too many code requests. Please try again later.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
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
      // No explicit choice: policy default_channel when eligible, else the eligible one
      // (FR-MFA-036, BR-MFA-10 — the shipped default_channel default is email).
      channel = resolveChallengeChannel(settings, null, eligible);
    }
    const destination = destinationFor(channel, contacts) as string;

    const challenge = await this.issuer.issue({
      customerId: command.customerId,
      purpose: MfaChallengePurpose.ENABLE,
      channel,
      destination,
      ttlSeconds: settings.otpTtlSeconds,
      now,
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
