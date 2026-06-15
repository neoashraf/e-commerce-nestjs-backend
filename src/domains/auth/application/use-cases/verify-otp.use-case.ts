import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';

import { Customer } from '../../domain/entities/customer.entity';
import { Session } from '../../domain/entities/session.entity';
import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../domain/repositories/customer.repository.interface';
import {
  IOtpChallengeRepository,
  OTP_CHALLENGE_REPOSITORY,
} from '../../domain/repositories/otp-challenge.repository.interface';
import {
  ISessionRepository,
  SESSION_REPOSITORY,
} from '../../domain/repositories/session.repository.interface';
import { AUTH_CONFIG, AuthConfig } from '../ports/auth-config.port';
import { GUEST_ORDER_CLAIM_PORT, IGuestOrderClaimPort } from '../ports/guest-order-claim.port';
import { IOtpService, OTP_SERVICE } from '../ports/otp-service.port';
import { ITokenService, TOKEN_SERVICE } from '../ports/token-service.port';

export interface VerifyOtpCommand {
  challengeId: string;
  code: string;
  fullName?: string;
}

export interface VerifyOtpResult {
  isNewAccount: boolean;
  customer: { id: string; fullName: string; phone: string; phoneVerified: boolean };
  tokens: { accessToken: string; refreshToken: string; expiresIn: number };
}

@Injectable()
export class VerifyOtpUseCase {
  constructor(
    @Inject(OTP_CHALLENGE_REPOSITORY) private readonly challenges: IOtpChallengeRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: ISessionRepository,
    @Inject(OTP_SERVICE) private readonly otp: IOtpService,
    @Inject(TOKEN_SERVICE) private readonly tokens: ITokenService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(GUEST_ORDER_CLAIM_PORT) private readonly guestOrderClaim: IGuestOrderClaimPort,
  ) {}

  async execute(command: VerifyOtpCommand): Promise<VerifyOtpResult> {
    const now = new Date();
    const challenge = await this.challenges.findById(command.challengeId);
    if (!challenge) {
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

    let customer = await this.customers.findActiveByPhone(challenge.phone);
    let isNewAccount = false;

    if (customer) {
      // Known phone → login (FR-AUTH-003, 010).
      if (!customer.phoneVerified) {
        customer.phoneVerified = true;
      }
      customer.markLoggedIn(now);
      customer = await this.customers.save(customer);
    } else {
      // New phone → register; full_name required (FR-AUTH-001, 006 / AC4).
      const fullName = command.fullName?.trim();
      if (!fullName || fullName.length < 2) {
        throw new ConflictException({
          code: 'FULL_NAME_REQUIRED',
          message: 'full_name is required to register a new account.',
        });
      }
      customer = Customer.registerWithPhone(randomUUID(), fullName, challenge.phone, now);
      customer.markLoggedIn(now);
      customer = await this.customers.save(customer);
      isNewAccount = true;
    }

    // Link any prior guest orders placed under this (now OTP-verified) phone to the account, so a
    // shopper who checked out as a guest sees those orders once they sign in (FR-AUTH-072 spirit).
    // Phone ownership is proven by the OTP just consumed; degrades gracefully (never blocks login).
    await this.guestOrderClaim.claimByPhone(challenge.phone, customer.id);

    const access = await this.tokens.signAccessToken(customer.id);
    const refresh = this.tokens.mintRefreshToken(now);
    await this.sessions.save(
      Session.issue(randomUUID(), customer.id, refresh.hash, refresh.expiresAt, now),
    );

    return {
      isNewAccount,
      customer: {
        id: customer.id,
        fullName: customer.fullName,
        phone: customer.phone,
        phoneVerified: customer.phoneVerified,
      },
      tokens: {
        accessToken: access.token,
        refreshToken: refresh.raw,
        expiresIn: access.expiresIn,
      },
    };
  }
}
