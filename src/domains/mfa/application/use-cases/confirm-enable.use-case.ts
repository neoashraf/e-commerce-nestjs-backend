import { BadRequestException, HttpException, Inject, Injectable } from '@nestjs/common';

import { IOtpService, OTP_SERVICE } from '../../../auth/application/ports/otp-service.port';
import {
  INotificationDispatcher,
  NOTIFICATION_DISPATCHER,
} from '../../../auth/application/ports/notification-dispatcher.port';
import { CustomerMfa } from '../../domain/entities/customer-mfa.entity';
import { MfaChannel } from '../../domain/enums/mfa-channel.enum';
import { MfaChallengePurpose } from '../../domain/enums/mfa-challenge-purpose.enum';
import {
  CUSTOMER_MFA_REPOSITORY,
  ICustomerMfaRepository,
} from '../../domain/repositories/customer-mfa.repository.interface';
import {
  IMfaChallengeRepository,
  MFA_CHALLENGE_REPOSITORY,
} from '../../domain/repositories/mfa-challenge.repository.interface';
import {
  IMfaSettingsRepository,
  MFA_SETTINGS_REPOSITORY,
} from '../../domain/repositories/mfa-settings.repository.interface';

const HTTP_LOCKED = 423;

export interface ConfirmEnableCommand {
  customerId: string;
  challengeId: string;
  code: string;
}

export interface ConfirmEnableResult {
  enabled: boolean;
  preferredChannel: MfaChannel;
  enabledAt: Date;
}

/** Confirm the enable code and activate 2FA for the customer (FR-MFA-001, 006). */
@Injectable()
export class ConfirmEnableUseCase {
  constructor(
    @Inject(MFA_CHALLENGE_REPOSITORY) private readonly challenges: IMfaChallengeRepository,
    @Inject(CUSTOMER_MFA_REPOSITORY) private readonly customerMfa: ICustomerMfaRepository,
    @Inject(MFA_SETTINGS_REPOSITORY) private readonly settingsRepo: IMfaSettingsRepository,
    @Inject(OTP_SERVICE) private readonly otp: IOtpService,
    @Inject(NOTIFICATION_DISPATCHER) private readonly dispatcher: INotificationDispatcher,
  ) {}

  async execute(command: ConfirmEnableCommand): Promise<ConfirmEnableResult> {
    const now = new Date();
    const challenge = await this.challenges.findById(command.challengeId);
    if (
      !challenge ||
      challenge.customerId !== command.customerId ||
      challenge.purpose !== MfaChallengePurpose.ENABLE
    ) {
      throw new BadRequestException({ code: 'INVALID_CODE', message: 'Invalid or expired code.' });
    }

    const maxAttempts = (await this.settingsRepo.get())?.maxAttempts ?? 5;
    if (challenge.isConsumed()) {
      throw new BadRequestException({ code: 'INVALID_CODE', message: 'This code has already been used.' });
    }
    if (challenge.attemptsExhausted(maxAttempts)) {
      throw new HttpException({ code: 'MFA_LOCKED', message: 'Too many attempts. Start again.' }, HTTP_LOCKED);
    }
    if (challenge.isExpired(now)) {
      throw new BadRequestException({ code: 'CODE_EXPIRED', message: 'This code has expired.' });
    }

    const matches = await this.otp.compare(command.code, challenge.otpHash);
    if (!matches) {
      challenge.registerFailedAttempt();
      await this.challenges.save(challenge);
      throw new BadRequestException({ code: 'INVALID_CODE', message: 'Invalid code.' });
    }

    challenge.consume(now);
    await this.challenges.save(challenge);

    const channel = challenge.channel;
    const state =
      (await this.customerMfa.findByCustomerId(command.customerId)) ??
      CustomerMfa.none(command.customerId, now);
    state.enable(channel, now);
    await this.customerMfa.save(state);

    await this.dispatcher.dispatchMfaStateChange({
      channel,
      phone: channel === MfaChannel.SMS ? challenge.destination : null,
      email: channel === MfaChannel.EMAIL ? challenge.destination : null,
      enabled: true,
    });

    return { enabled: true, preferredChannel: channel, enabledAt: state.enabledAt as Date };
  }
}
