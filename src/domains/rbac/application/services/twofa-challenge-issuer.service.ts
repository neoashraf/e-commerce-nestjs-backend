import { randomUUID } from 'crypto';
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';

import { AdminUser } from '../../domain/entities/admin-user.entity';
import { TwofaChallenge } from '../../domain/entities/twofa-challenge.entity';
import { TwofaChannel } from '../../domain/enums/twofa-channel.enum';
import { TwofaPurpose } from '../../domain/enums/twofa-purpose.enum';
import {
  ITwofaChallengeRepository,
  TWOFA_CHALLENGE_REPOSITORY,
} from '../../domain/repositories/twofa-challenge.repository.interface';
import {
  ADMIN_NOTIFICATION_DISPATCHER,
  IAdminNotificationDispatcher,
} from '../ports/admin-notification.port';
import { ADMIN_OTP_SERVICE, IAdminOtpService } from '../ports/admin-otp.port';
import { RBAC_CONFIG, RbacConfig } from '../ports/rbac-config.port';

export interface IssuedTwofaChallenge {
  challengeId: string;
  sentTo: string;
  expiresIn: number;
  resendAfter: number;
}

/** Mask an admin email for display, e.g. `o**@store.com` (contract 16). */
export function maskAdminEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${(local ?? '').slice(0, 1)}**@${domain ?? ''}`;
}

/**
 * Issues purpose-bound admin 2FA settings challenges (enable/disable, FR-RBAC-008/009):
 * email-only codes with the standard resend cooldown + hourly cap (FR-RBAC-008 — the
 * settings path is not a code-flooding bypass).
 */
@Injectable()
export class TwofaChallengeIssuerService {
  constructor(
    @Inject(TWOFA_CHALLENGE_REPOSITORY) private readonly challenges: ITwofaChallengeRepository,
    @Inject(ADMIN_OTP_SERVICE) private readonly otp: IAdminOtpService,
    @Inject(ADMIN_NOTIFICATION_DISPATCHER)
    private readonly notifier: IAdminNotificationDispatcher,
    @Inject(RBAC_CONFIG) private readonly config: RbacConfig,
  ) {}

  async issue(
    admin: AdminUser,
    purpose: TwofaPurpose,
    now: Date,
  ): Promise<IssuedTwofaChallenge> {
    // Resend cooldown (any purpose — one code stream per admin).
    const latest = await this.challenges.findLatestByAdmin(admin.id);
    if (latest) {
      const elapsed = (now.getTime() - latest.createdAt.getTime()) / 1000;
      if (elapsed < this.config.twofaResendCooldownSeconds) {
        throw new HttpException(
          {
            code: 'TWOFA_COOLDOWN',
            message: 'Please wait before requesting another code.',
            retry_after: Math.ceil(this.config.twofaResendCooldownSeconds - elapsed),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    // Hourly cap.
    const since = new Date(now.getTime() - 3600 * 1000);
    const recent = await this.challenges.countCreatedSince(admin.id, since);
    if (recent >= this.config.twofaHourlyCap) {
      throw new HttpException(
        { code: 'TWOFA_HOURLY_CAP', message: 'Too many code requests. Please try again later.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const generated = await this.otp.generate();
    const ttl = this.config.twofaOtpTtlSeconds;
    // Admin 2FA is email-only (decision 2026-07-18, FR-RBAC-002).
    const challenge = new TwofaChallenge(
      randomUUID(),
      admin.id,
      generated.hash,
      TwofaChannel.EMAIL,
      false,
      0,
      new Date(now.getTime() + ttl * 1000),
      null,
      now,
      purpose,
    );
    await this.challenges.save(challenge);
    await this.notifier.dispatchTwofaCode({
      channel: TwofaChannel.EMAIL,
      phone: null,
      email: admin.email,
      code: generated.code,
      ttlMinutes: Math.ceil(ttl / 60),
    });

    return {
      challengeId: challenge.id,
      sentTo: maskAdminEmail(admin.email),
      expiresIn: ttl,
      resendAfter: this.config.twofaResendCooldownSeconds,
    };
  }
}
