import { randomUUID } from 'crypto';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';

import { Customer } from '../../../auth/domain/entities/customer.entity';
import { MfaPreAuth } from '../../domain/entities/mfa-pre-auth.entity';
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
import { MFA_CONFIG, MfaConfig } from '../ports/mfa-config.port';
import { MfaLoginStarted } from '../mfa-results';
import { MfaChallengeIssuer } from './mfa-challenge-issuer.service';
import { destinationFor, eligibleChannels, maskDestination } from './mfa-channels';
import { mintPreAuthToken } from './pre-auth-token';

/**
 * The login second-factor gate (FR-MFA-010). Consulted by AUTH's email+password login AFTER the
 * password is verified: decides whether a second factor is required (customer-enabled OR policy
 * `mandatory`), and if so starts a challenge + issues a pre-auth token. Returns `null` when no
 * second factor is needed (login proceeds to tokens as normal).
 */
@Injectable()
export class MfaLoginGateService {
  constructor(
    @Inject(MFA_SETTINGS_REPOSITORY) private readonly settingsRepo: IMfaSettingsRepository,
    @Inject(CUSTOMER_MFA_REPOSITORY) private readonly customerMfaRepo: ICustomerMfaRepository,
    @Inject(MFA_PRE_AUTH_REPOSITORY) private readonly preAuthRepo: IMfaPreAuthRepository,
    @Inject(MFA_CONFIG) private readonly config: MfaConfig,
    private readonly issuer: MfaChallengeIssuer,
  ) {}

  async startIfRequired(customer: Customer, now: Date): Promise<MfaLoginStarted | null> {
    const settings = await this.settingsRepo.get();
    if (!settings) return null; // no policy row → 2FA effectively off (fail-open to normal login)

    const state = await this.customerMfaRepo.findByCustomerId(customer.id);
    const required = settings.isMandatory || (state?.enabled ?? false);
    if (!required) return null;

    const contacts = {
      email: customer.email,
      emailVerified: customer.emailVerified,
      phone: customer.phone,
      phoneVerified: customer.phoneVerified,
    };
    const eligible = eligibleChannels(settings, contacts);
    if (eligible.length === 0) {
      // Mandatory (or previously-enabled) but the customer has no verified+enabled channel to
      // receive a code on — they must set one up first (FR-MFA-033, edge §12.5).
      throw new ForbiddenException({
        code: 'MFA_CHANNEL_SETUP_REQUIRED',
        message: 'Two-factor authentication is required but no verified delivery channel is available. Verify a phone or email first.',
      });
    }

    const preferred = state?.preferredChannel ?? null;
    const channel = preferred && eligible.includes(preferred) ? preferred : eligible[0];
    const destination = destinationFor(channel, contacts);
    // eligibleChannels guarantees a destination exists for `channel`.
    const dest = destination as string;

    const challenge = await this.issuer.issue({
      customerId: customer.id,
      purpose: MfaChallengePurpose.LOGIN_2FA,
      channel,
      destination: dest,
      ttlSeconds: settings.otpTtlSeconds,
      now,
    });

    const { raw, hash } = mintPreAuthToken();
    await this.preAuthRepo.save(
      MfaPreAuth.issue(randomUUID(), customer.id, challenge.id, hash, this.config.preAuthTtlSeconds, now),
    );

    return {
      preAuthToken: raw,
      challenge: {
        id: challenge.id,
        channel,
        sentTo: maskDestination(channel, dest),
        expiresIn: settings.otpTtlSeconds,
        resendAfter: settings.resendCooldownSeconds,
      },
      availableChannels: eligible,
    };
  }
}
