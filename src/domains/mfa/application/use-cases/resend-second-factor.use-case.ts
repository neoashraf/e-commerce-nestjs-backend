import { HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import {
  IMfaChallengeRepository,
  MFA_CHALLENGE_REPOSITORY,
} from '../../domain/repositories/mfa-challenge.repository.interface';
import {
  IMfaPreAuthRepository,
  MFA_PRE_AUTH_REPOSITORY,
} from '../../domain/repositories/mfa-pre-auth.repository.interface';
import {
  IMfaSettingsRepository,
  MFA_SETTINGS_REPOSITORY,
} from '../../domain/repositories/mfa-settings.repository.interface';
import { MFA_CONFIG, MfaConfig } from '../ports/mfa-config.port';
import { MfaChallengeView } from '../mfa-results';
import { MfaChallengeIssuer } from '../services/mfa-challenge-issuer.service';
import { maskDestination } from '../services/mfa-channels';
import { hashPreAuthToken } from '../services/pre-auth-token';

export interface ResendSecondFactorCommand {
  preAuthToken: string;
}

/** Resend the current second-factor code, subject to cooldown + hourly cap (FR-MFA-016). */
@Injectable()
export class ResendSecondFactorUseCase {
  constructor(
    @Inject(MFA_PRE_AUTH_REPOSITORY) private readonly preAuth: IMfaPreAuthRepository,
    @Inject(MFA_CHALLENGE_REPOSITORY) private readonly challenges: IMfaChallengeRepository,
    @Inject(MFA_SETTINGS_REPOSITORY) private readonly settingsRepo: IMfaSettingsRepository,
    @Inject(MFA_CONFIG) private readonly config: MfaConfig,
    private readonly issuer: MfaChallengeIssuer,
  ) {}

  async execute(command: ResendSecondFactorCommand): Promise<MfaChallengeView> {
    const now = new Date();
    const preAuth = await this.preAuth.findByTokenHash(hashPreAuthToken(command.preAuthToken));
    if (!preAuth || !preAuth.isUsable(now)) {
      throw new UnauthorizedException({
        code: 'PRE_AUTH_INVALID',
        message: 'Your login session has expired. Please sign in again.',
      });
    }

    const settings = await this.settingsRepo.get();
    const ttl = settings?.otpTtlSeconds ?? 300;
    const cooldown = settings?.resendCooldownSeconds ?? 60;

    const current = await this.challenges.findById(preAuth.challengeId);
    if (!current) {
      throw new UnauthorizedException({
        code: 'PRE_AUTH_INVALID',
        message: 'Your login session has expired. Please sign in again.',
      });
    }

    // Resend cooldown (FR-MFA-016).
    const latest = await this.challenges.findLatestByCustomer(preAuth.customerId);
    if (latest) {
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

    // Hourly cap (FR-MFA-040).
    const since = new Date(now.getTime() - 3600 * 1000);
    const recent = await this.challenges.countCreatedSince(preAuth.customerId, since);
    if (recent >= this.config.resendHourlyCap) {
      throw new HttpException(
        { code: 'MFA_HOURLY_CAP', message: 'Too many code requests. Please try again later.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const fresh = await this.issuer.issue({
      customerId: preAuth.customerId,
      purpose: current.purpose,
      channel: current.channel,
      destination: current.destination,
      ttlSeconds: ttl,
      now,
    });
    preAuth.rebind(fresh.id);
    await this.preAuth.save(preAuth);

    return {
      id: fresh.id,
      channel: fresh.channel,
      sentTo: maskDestination(fresh.channel, fresh.destination),
      expiresIn: ttl,
      resendAfter: cooldown,
    };
  }
}
