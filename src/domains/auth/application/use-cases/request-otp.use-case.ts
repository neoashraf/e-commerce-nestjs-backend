import { randomUUID } from 'crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';

import { OtpChallenge } from '../../domain/entities/otp-challenge.entity';
import { OtpPurpose } from '../../domain/enums/otp-purpose.enum';
import { BdPhone } from '../../domain/value-objects/bd-phone.vo';
import {
  IOtpChallengeRepository,
  OTP_CHALLENGE_REPOSITORY,
} from '../../domain/repositories/otp-challenge.repository.interface';
import { AUTH_CONFIG, AuthConfig } from '../ports/auth-config.port';
import { IOtpService, OTP_SERVICE } from '../ports/otp-service.port';
import {
  INotificationDispatcher,
  NOTIFICATION_DISPATCHER,
} from '../ports/notification-dispatcher.port';

export interface RequestOtpCommand {
  phone: string;
  purpose?: OtpPurpose;
}

export interface RequestOtpResult {
  challengeId: string;
  expiresIn: number;
  resendAfter: number;
}

@Injectable()
export class RequestOtpUseCase {
  private readonly logger = new Logger(RequestOtpUseCase.name);

  constructor(
    @Inject(OTP_CHALLENGE_REPOSITORY) private readonly challenges: IOtpChallengeRepository,
    @Inject(OTP_SERVICE) private readonly otp: IOtpService,
    @Inject(NOTIFICATION_DISPATCHER) private readonly dispatcher: INotificationDispatcher,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async execute(command: RequestOtpCommand): Promise<RequestOtpResult> {
    const phone = BdPhone.toE164(command.phone);
    if (!phone) {
      throw new BadRequestException({
        code: 'INVALID_PHONE',
        message: 'Invalid Bangladesh mobile number.',
      });
    }
    const purpose =
      command.purpose === OtpPurpose.REGISTER ? OtpPurpose.REGISTER : OtpPurpose.LOGIN;
    const now = new Date();

    // Resend cooldown (FR-AUTH-022).
    const latest = await this.challenges.findLatestByPhone(phone);
    if (latest) {
      const elapsed = (now.getTime() - latest.createdAt.getTime()) / 1000;
      if (elapsed < this.config.otpResendCooldownSeconds) {
        throw new HttpException(
          {
            code: 'OTP_COOLDOWN',
            message: 'Please wait before requesting another code.',
            retry_after: Math.ceil(this.config.otpResendCooldownSeconds - elapsed),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // Hourly cap (FR-AUTH-022).
    const since = new Date(now.getTime() - 3600 * 1000);
    const recentCount = await this.challenges.countCreatedSince(phone, since);
    if (recentCount >= this.config.otpHourlyCap) {
      throw new HttpException(
        { code: 'OTP_HOURLY_CAP', message: 'Too many OTP requests. Please try again later.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Invalidate any prior outstanding OTP for this phone (FR-AUTH-024).
    await this.challenges.consumeOutstandingForPhone(phone, now);

    // Issue a fresh OTP, store only the hash (FR-AUTH-020).
    const code = this.otp.generateCode();
    const otpHash = await this.otp.hash(code);
    const challenge = OtpChallenge.issue(
      randomUUID(),
      phone,
      otpHash,
      purpose,
      this.config.otpTtlSeconds,
      now,
    );
    await this.challenges.save(challenge);

    // Trigger SMS via NOTIF (FR-AUTH-021); delivery failure → 503, no side effects (AC2).
    try {
      await this.dispatcher.dispatchOtp({
        phone,
        code,
        purpose: purpose === OtpPurpose.REGISTER ? 'register' : 'login',
      });
    } catch (err) {
      this.logger.error(`OTP dispatch failed for ${phone}: ${(err as Error).message}`);
      throw new HttpException(
        { code: 'SMS_UNAVAILABLE', message: "Couldn't send the code. Please try again." },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return {
      challengeId: challenge.id,
      expiresIn: this.config.otpTtlSeconds,
      resendAfter: this.config.otpResendCooldownSeconds,
    };
  }
}
