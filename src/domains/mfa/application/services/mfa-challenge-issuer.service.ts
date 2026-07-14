import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { IOtpService, OTP_SERVICE } from '../../../auth/application/ports/otp-service.port';
import {
  INotificationDispatcher,
  NOTIFICATION_DISPATCHER,
} from '../../../auth/application/ports/notification-dispatcher.port';
import { MfaChallenge } from '../../domain/entities/mfa-challenge.entity';
import { MfaChannel } from '../../domain/enums/mfa-channel.enum';
import { MfaChallengePurpose } from '../../domain/enums/mfa-challenge-purpose.enum';
import {
  IMfaChallengeRepository,
  MFA_CHALLENGE_REPOSITORY,
} from '../../domain/repositories/mfa-challenge.repository.interface';

export interface IssueChallengeInput {
  customerId: string;
  purpose: MfaChallengePurpose;
  channel: MfaChannel;
  destination: string;
  ttlSeconds: number;
  now: Date;
}

/**
 * Shared issuance path for every second-factor code (login gate, resend, channel switch, enable):
 * invalidate prior outstanding codes, mint a fresh single-use hashed OTP, and dispatch it over the
 * chosen channel. Delivery failure is non-fatal (FR-MFA-022) — the customer can resend/switch;
 * the challenge still exists so the flow isn't dead-ended.
 */
@Injectable()
export class MfaChallengeIssuer {
  private readonly logger = new Logger(MfaChallengeIssuer.name);

  constructor(
    @Inject(MFA_CHALLENGE_REPOSITORY) private readonly challenges: IMfaChallengeRepository,
    @Inject(OTP_SERVICE) private readonly otp: IOtpService,
    @Inject(NOTIFICATION_DISPATCHER) private readonly dispatcher: INotificationDispatcher,
  ) {}

  async issue(input: IssueChallengeInput): Promise<MfaChallenge> {
    // Invalidate any prior outstanding code for this customer (only the latest is valid).
    await this.challenges.consumeOutstandingForCustomer(input.customerId, input.now);

    const code = this.otp.generateCode();
    const otpHash = await this.otp.hash(code);
    const challenge = MfaChallenge.issue(
      randomUUID(),
      input.customerId,
      input.purpose,
      input.channel,
      input.destination,
      otpHash,
      input.ttlSeconds,
      input.now,
    );
    await this.challenges.save(challenge);
    await this.dispatchSafe(input.channel, input.destination, code);
    return challenge;
  }

  private async dispatchSafe(channel: MfaChannel, destination: string, code: string): Promise<void> {
    try {
      await this.dispatcher.dispatchMfaCode({
        channel,
        phone: channel === MfaChannel.SMS ? destination : null,
        email: channel === MfaChannel.EMAIL ? destination : null,
        code,
      });
    } catch (err) {
      // Non-fatal: the customer can resend or switch channel (FR-MFA-022).
      this.logger.error(`MFA code dispatch failed (${channel}): ${(err as Error).message}`);
    }
  }
}
