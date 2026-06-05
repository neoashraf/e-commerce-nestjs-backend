import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';

import { OtpPurpose } from '../../domain/enums/otp-purpose.enum';
import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../domain/repositories/customer.repository.interface';
import {
  IOtpChallengeRepository,
  OTP_CHALLENGE_REPOSITORY,
} from '../../domain/repositories/otp-challenge.repository.interface';
import { AUTH_CONFIG, AuthConfig } from '../ports/auth-config.port';
import { IOtpService, OTP_SERVICE } from '../ports/otp-service.port';

export interface ConfirmPhoneChangeCommand {
  customerId: string;
  challengeId: string;
  code: string;
}

export interface ConfirmPhoneChangeResult {
  phone: string;
  phoneVerified: boolean;
}

/** Confirm a phone change (FR-AUTH-042): verify the OTP on the new number, then replace it. */
@Injectable()
export class ConfirmPhoneChangeUseCase {
  constructor(
    @Inject(OTP_CHALLENGE_REPOSITORY) private readonly challenges: IOtpChallengeRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    @Inject(OTP_SERVICE) private readonly otp: IOtpService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async execute(command: ConfirmPhoneChangeCommand): Promise<ConfirmPhoneChangeResult> {
    const now = new Date();
    const challenge = await this.challenges.findById(command.challengeId);
    if (!challenge || challenge.purpose !== OtpPurpose.PHONE_CHANGE) {
      throw new BadRequestException({ code: 'INVALID_OTP', message: 'Invalid or expired code.' });
    }
    if (challenge.isConsumed()) {
      throw new BadRequestException({
        code: 'OTP_CONSUMED',
        message: 'This code has already been used.',
      });
    }
    if (challenge.attemptsExhausted(this.config.otpAttemptCap)) {
      throw new HttpException(
        { code: 'OTP_LOCKED', message: 'Too many attempts. Request a new code.' },
        423, // Locked
      );
    }
    if (challenge.isExpired(now)) {
      throw new BadRequestException({ code: 'OTP_EXPIRED', message: 'This code has expired.' });
    }

    const matches = await this.otp.compare(command.code, challenge.otpHash);
    if (!matches) {
      challenge.registerFailedAttempt();
      await this.challenges.save(challenge);
      if (challenge.attemptsExhausted(this.config.otpAttemptCap)) {
        throw new HttpException(
          { code: 'OTP_LOCKED', message: 'Too many attempts. Request a new code.' },
          423, // Locked
        );
      }
      throw new BadRequestException({ code: 'INVALID_OTP', message: 'Invalid code.' });
    }

    challenge.consume(now);
    await this.challenges.save(challenge);

    // Re-check the new number is still free (guards against a race since request).
    const existing = await this.customers.findActiveByPhone(challenge.phone);
    if (existing && existing.id !== command.customerId) {
      throw new ConflictException({
        code: 'PHONE_IN_USE',
        message: 'That phone number is already registered to another account.',
      });
    }

    const customer = await this.customers.findById(command.customerId);
    if (!customer) {
      throw new HttpException(
        { code: 'CUSTOMER_NOT_FOUND', message: 'Account not found.' },
        HttpStatus.NOT_FOUND,
      );
    }

    customer.setPhone(challenge.phone, now);
    const saved = await this.customers.save(customer);

    return { phone: saved.phone, phoneVerified: saved.phoneVerified };
  }
}
