import { BadRequestException, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';

import { Customer } from '../../domain/entities/customer.entity';
import { OtpPurpose } from '../../domain/enums/otp-purpose.enum';
import { isValidCustomerPassword } from '../../domain/password-policy';
import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../domain/repositories/customer.repository.interface';
import {
  IOtpChallengeRepository,
  OTP_CHALLENGE_REPOSITORY,
} from '../../domain/repositories/otp-challenge.repository.interface';
import {
  IPasswordResetTokenRepository,
  PASSWORD_RESET_TOKEN_REPOSITORY,
} from '../../domain/repositories/password-reset-token.repository.interface';
import {
  ISessionRepository,
  SESSION_REPOSITORY,
} from '../../domain/repositories/session.repository.interface';
import { AUTH_CONFIG, AuthConfig } from '../ports/auth-config.port';
import { IOtpService, OTP_SERVICE } from '../ports/otp-service.port';
import { IPasswordHasher, PASSWORD_HASHER } from '../ports/password-hasher.port';
import {
  IVerificationTokenService,
  VERIFICATION_TOKEN_SERVICE,
} from '../ports/verification-token.port';

/** HTTP 423 Locked is not in Nest's HttpStatus enum. */
const HTTP_LOCKED = 423;

export interface ResetPasswordCommand {
  newPassword: string;
  /** Email path (FR-AUTH-033): single-use token from the reset link. */
  token?: string;
  /** Phone path (FR-AUTH-034): OTP requested with `purpose=password_reset`. */
  challengeId?: string;
  code?: string;
}

/**
 * Reset a password (FR-AUTH-033/034/035): validates the policy (weak → 400), then proves
 * ownership by EITHER an email reset token (expired/used → 410) OR a phone OTP
 * (`purpose=password_reset`; invalid/expired → 400), sets the new hash, and revokes ALL
 * active sessions (AC2/AC3).
 */
@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly tokens: IPasswordResetTokenRepository,
    @Inject(OTP_CHALLENGE_REPOSITORY) private readonly challenges: IOtpChallengeRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: ISessionRepository,
    @Inject(VERIFICATION_TOKEN_SERVICE) private readonly tokenService: IVerificationTokenService,
    @Inject(OTP_SERVICE) private readonly otp: IOtpService,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async execute(command: ResetPasswordCommand): Promise<void> {
    const now = new Date();

    if (!isValidCustomerPassword(command.newPassword)) {
      throw new HttpException(
        {
          code: 'WEAK_PASSWORD',
          message: 'Password must be at least 8 characters and include a letter and a number.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const customer = command.token
      ? await this.resolveViaToken(command.token, now)
      : await this.resolveViaOtp(command.challengeId, command.code, now);

    customer.setPassword(await this.hasher.hash(command.newPassword), now);
    await this.customers.save(customer);

    // Revoke every active session on a successful reset (FR-AUTH-035).
    await this.sessions.revokeAllForCustomer(customer.id, now);
  }

  /** Email path (FR-AUTH-033): consume a single-use reset token; expired/used → 410. */
  private async resolveViaToken(rawToken: string, now: Date): Promise<Customer> {
    const hash = this.tokenService.hash(rawToken);
    const token = await this.tokens.findByTokenHash(hash);
    if (!token || !token.isUsable(now)) {
      throw new HttpException(
        { code: 'RESET_TOKEN_INVALID', message: 'This reset link has expired or already been used.' },
        HttpStatus.GONE,
      );
    }

    const customer = await this.customers.findById(token.customerId);
    if (!customer) {
      throw new HttpException(
        { code: 'RESET_TOKEN_INVALID', message: 'This reset link has expired or already been used.' },
        HttpStatus.GONE,
      );
    }

    token.consume(now);
    await this.tokens.save(token);
    return customer;
  }

  /** Phone path (FR-AUTH-034): verify a `password_reset` OTP and resolve its account. */
  private async resolveViaOtp(
    challengeId: string | undefined,
    code: string | undefined,
    now: Date,
  ): Promise<Customer> {
    if (!challengeId || !code) {
      throw new BadRequestException({
        code: 'RESET_PROOF_REQUIRED',
        message: 'Provide either a reset token or a phone OTP (challenge_id + code).',
      });
    }

    const challenge = await this.challenges.findById(challengeId);
    if (!challenge || challenge.purpose !== OtpPurpose.PASSWORD_RESET) {
      throw new BadRequestException({ code: 'INVALID_OTP', message: 'Invalid or expired code.' });
    }
    if (challenge.isConsumed()) {
      throw new BadRequestException({ code: 'OTP_CONSUMED', message: 'This code has already been used.' });
    }
    if (challenge.attemptsExhausted(this.config.otpAttemptCap)) {
      throw new HttpException({ code: 'OTP_LOCKED', message: 'Too many attempts. Request a new code.' }, HTTP_LOCKED);
    }
    if (challenge.isExpired(now)) {
      throw new BadRequestException({ code: 'OTP_EXPIRED', message: 'This code has expired.' });
    }

    const matches = await this.otp.compare(code, challenge.otpHash);
    if (!matches) {
      challenge.registerFailedAttempt();
      await this.challenges.save(challenge);
      if (challenge.attemptsExhausted(this.config.otpAttemptCap)) {
        throw new HttpException({ code: 'OTP_LOCKED', message: 'Too many attempts. Request a new code.' }, HTTP_LOCKED);
      }
      throw new BadRequestException({ code: 'INVALID_OTP', message: 'Invalid code.' });
    }

    const customer = await this.customers.findActiveByPhone(challenge.phone);
    if (!customer) {
      // Don't reveal whether the number maps to an account.
      throw new BadRequestException({ code: 'INVALID_OTP', message: 'Invalid or expired code.' });
    }

    challenge.consume(now);
    await this.challenges.save(challenge);
    return customer;
  }
}
