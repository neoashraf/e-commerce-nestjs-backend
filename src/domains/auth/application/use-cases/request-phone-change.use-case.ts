import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
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
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../domain/repositories/customer.repository.interface';
import {
  IOtpChallengeRepository,
  OTP_CHALLENGE_REPOSITORY,
} from '../../domain/repositories/otp-challenge.repository.interface';
import { AUTH_CONFIG, AuthConfig } from '../ports/auth-config.port';
import {
  INotificationDispatcher,
  NOTIFICATION_DISPATCHER,
} from '../ports/notification-dispatcher.port';
import { IOtpService, OTP_SERVICE } from '../ports/otp-service.port';

export interface RequestPhoneChangeCommand {
  customerId: string;
  newPhone: string;
}

export interface RequestPhoneChangeResult {
  challengeId: string;
  expiresIn: number;
}

/**
 * Begin a phone change (FR-AUTH-042): OTP the NEW number before it replaces the old one.
 * The old number stays active until confirm. A new phone already registered to another
 * active account → 409.
 */
@Injectable()
export class RequestPhoneChangeUseCase {
  private readonly logger = new Logger(RequestPhoneChangeUseCase.name);

  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    @Inject(OTP_CHALLENGE_REPOSITORY) private readonly challenges: IOtpChallengeRepository,
    @Inject(OTP_SERVICE) private readonly otp: IOtpService,
    @Inject(NOTIFICATION_DISPATCHER) private readonly dispatcher: INotificationDispatcher,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async execute(command: RequestPhoneChangeCommand): Promise<RequestPhoneChangeResult> {
    const phone = BdPhone.toE164(command.newPhone);
    if (!phone) {
      throw new BadRequestException({
        code: 'INVALID_PHONE',
        message: 'Invalid Bangladesh mobile number.',
      });
    }

    const existing = await this.customers.findActiveByPhone(phone);
    if (existing && existing.id !== command.customerId) {
      throw new ConflictException({
        code: 'PHONE_IN_USE',
        message: 'That phone number is already registered to another account.',
      });
    }

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

    await this.challenges.consumeOutstandingForPhone(phone, now);

    const code = this.otp.generateCode();
    const otpHash = await this.otp.hash(code);
    const challenge = OtpChallenge.issue(
      randomUUID(),
      phone,
      otpHash,
      OtpPurpose.PHONE_CHANGE,
      this.config.otpTtlSeconds,
      now,
    );
    await this.challenges.save(challenge);

    try {
      await this.dispatcher.dispatchOtp({ phone, code, purpose: 'phone_change' });
    } catch (err) {
      this.logger.error(`Phone-change OTP dispatch failed for ${phone}: ${(err as Error).message}`);
      throw new HttpException(
        { code: 'SMS_UNAVAILABLE', message: "Couldn't send the code. Please try again." },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return { challengeId: challenge.id, expiresIn: this.config.otpTtlSeconds };
  }
}
