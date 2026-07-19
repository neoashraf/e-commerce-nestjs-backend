import { randomUUID } from 'crypto';
import { BadRequestException, HttpException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import { IOtpService, OTP_SERVICE } from '../../../auth/application/ports/otp-service.port';
import { ITokenService, TOKEN_SERVICE } from '../../../auth/application/ports/token-service.port';
import { Session } from '../../../auth/domain/entities/session.entity';
import {
  ISessionRepository,
  SESSION_REPOSITORY,
} from '../../../auth/domain/repositories/session.repository.interface';
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
import { hashPreAuthToken } from '../services/pre-auth-token';

/** HTTP 423 Locked is not in Nest's HttpStatus enum. */
const HTTP_LOCKED = 423;

export interface VerifySecondFactorCommand {
  preAuthToken: string;
  code: string;
  deviceLabel?: string | null;
}

export interface VerifySecondFactorResult {
  customer: { id: string };
  tokens: { accessToken: string; refreshToken: string; expiresIn: number };
}

/** Complete a 2FA login: validate the second-factor code, then issue the session (FR-MFA-013–015). */
@Injectable()
export class VerifySecondFactorUseCase {
  constructor(
    @Inject(MFA_PRE_AUTH_REPOSITORY) private readonly preAuth: IMfaPreAuthRepository,
    @Inject(MFA_CHALLENGE_REPOSITORY) private readonly challenges: IMfaChallengeRepository,
    @Inject(MFA_SETTINGS_REPOSITORY) private readonly settingsRepo: IMfaSettingsRepository,
    @Inject(OTP_SERVICE) private readonly otp: IOtpService,
    @Inject(TOKEN_SERVICE) private readonly tokens: ITokenService,
    @Inject(SESSION_REPOSITORY) private readonly sessions: ISessionRepository,
  ) {}

  async execute(command: VerifySecondFactorCommand): Promise<VerifySecondFactorResult> {
    const now = new Date();
    const preAuth = await this.preAuth.findByTokenHash(hashPreAuthToken(command.preAuthToken));
    if (!preAuth || !preAuth.isUsable(now)) {
      throw this.preAuthInvalid();
    }

    const challenge = await this.challenges.findById(preAuth.challengeId);
    if (!challenge || challenge.customerId !== preAuth.customerId) {
      throw this.preAuthInvalid();
    }

    const maxAttempts = (await this.settingsRepo.get())?.maxAttempts ?? 5;
    if (challenge.isConsumed()) {
      throw new BadRequestException({ code: 'INVALID_CODE', message: 'This code has already been used.' });
    }
    if (challenge.attemptsExhausted(maxAttempts)) {
      throw this.locked();
    }
    if (challenge.isExpired(now)) {
      throw new BadRequestException({ code: 'CODE_EXPIRED', message: 'This code has expired.' });
    }

    const matches = await this.otp.compare(command.code, challenge.otpHash);
    if (!matches) {
      challenge.registerFailedAttempt();
      await this.challenges.save(challenge);
      if (challenge.attemptsExhausted(maxAttempts)) {
        throw this.locked();
      }
      throw new BadRequestException({ code: 'INVALID_CODE', message: 'Invalid code.' });
    }

    // Success — consume both the challenge and the pre-auth token (single-use), then issue tokens.
    challenge.consume(now);
    await this.challenges.save(challenge);
    preAuth.consume(now);
    await this.preAuth.save(preAuth);

    const sessionId = randomUUID();
    // FR-MFA-018: this session was created through a completed second factor — stamp the
    // `mfa` token claim and the Session.mfa_verified flag.
    const access = await this.tokens.signAccessToken(preAuth.customerId, sessionId, {
      mfaVerified: true,
    });
    const refresh = this.tokens.mintRefreshToken(now);
    await this.sessions.save(
      Session.issue(
        sessionId,
        preAuth.customerId,
        refresh.hash,
        refresh.expiresAt,
        now,
        command.deviceLabel ?? null,
        null,
        true,
      ),
    );

    return {
      customer: { id: preAuth.customerId },
      tokens: { accessToken: access.token, refreshToken: refresh.raw, expiresIn: access.expiresIn },
    };
  }

  private preAuthInvalid(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'PRE_AUTH_INVALID',
      message: 'Your login session has expired. Please sign in again.',
    });
  }

  private locked(): HttpException {
    return new HttpException(
      { code: 'MFA_LOCKED', message: 'Too many incorrect codes. Please sign in again.' },
      HTTP_LOCKED,
    );
  }
}
