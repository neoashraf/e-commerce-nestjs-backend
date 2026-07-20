import { randomUUID } from 'crypto';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

import { OtpChallenge } from '../../domain/entities/otp-challenge.entity';
import { OtpPurpose } from '../../domain/enums/otp-purpose.enum';
import { PasswordSetToken } from '../../domain/entities/password-set-token.entity';
import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../domain/repositories/customer.repository.interface';
import {
  IOtpChallengeRepository,
  OTP_CHALLENGE_REPOSITORY,
} from '../../domain/repositories/otp-challenge.repository.interface';
import {
  IPasswordSetTokenRepository,
  PASSWORD_SET_TOKEN_REPOSITORY,
} from '../../domain/repositories/password-set-token.repository.interface';
import {
  ISessionRepository,
  SESSION_REPOSITORY,
} from '../../domain/repositories/session.repository.interface';
import { AUTH_CONFIG, AuthConfig } from '../ports/auth-config.port';
import { IOtpService, OTP_SERVICE } from '../ports/otp-service.port';
import {
  INotificationDispatcher,
  NOTIFICATION_DISPATCHER,
} from '../ports/notification-dispatcher.port';
import {
  IVerificationTokenService,
  VERIFICATION_TOKEN_SERVICE,
} from '../ports/verification-token.port';

export interface RequestPasswordSetCommand {
  customerId: string;
  /** The session id (JWT `sid`) making the request — used for the freshness check. */
  currentSessionId?: string;
}

export interface RequestPasswordSetResult {
  otpRequired: boolean;
  /** OTP path (FR-AUTH-036). */
  challengeId?: string;
  resendAfter?: number;
  /** Freshness path (FR-AUTH-037). */
  setToken?: string;
  expiresIn: number;
  /** DEV-ONLY: plaintext OTP when `otpDevReturn` is on (never in production). */
  devCode?: string;
}

/**
 * Start the first-password set flow (FR-AUTH-036/037): for a passwordless account with a
 * verified phone, either issue a `password_set` OTP to the account phone (standard
 * TTL/cooldown/caps, FR-AUTH-022) or — when the current session was itself OTP-verified
 * inside the freshness window — mint a short-lived single-use `set_token` instead.
 */
@Injectable()
export class RequestPasswordSetUseCase {
  private readonly logger = new Logger(RequestPasswordSetUseCase.name);

  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: ISessionRepository,
    @Inject(OTP_CHALLENGE_REPOSITORY) private readonly challenges: IOtpChallengeRepository,
    @Inject(PASSWORD_SET_TOKEN_REPOSITORY)
    private readonly setTokens: IPasswordSetTokenRepository,
    @Inject(OTP_SERVICE) private readonly otp: IOtpService,
    @Inject(VERIFICATION_TOKEN_SERVICE) private readonly tokenService: IVerificationTokenService,
    @Inject(NOTIFICATION_DISPATCHER) private readonly dispatcher: INotificationDispatcher,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async execute(command: RequestPasswordSetCommand): Promise<RequestPasswordSetResult> {
    const now = new Date();
    const customer = await this.customers.findById(command.customerId);
    if (!customer || !customer.isActive) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Not authenticated.' });
    }
    if (customer.passwordHash) {
      throw new ConflictException({
        code: 'PASSWORD_EXISTS',
        message: 'This account already has a password. Use change password instead.',
      });
    }
    if (!customer.phone || !customer.phoneVerified) {
      throw new ConflictException({
        code: 'PHONE_REQUIRED',
        message: 'Add and verify a phone number before setting a password.',
      });
    }

    // Freshness window (FR-AUTH-037): the session was itself established by a phone OTP
    // verified < N minutes ago → skip the extra OTP, hand out a single-use set token.
    if (command.currentSessionId) {
      const session = await this.sessions.findById(command.currentSessionId);
      if (
        session &&
        session.customerId === customer.id &&
        session.isActive(now) &&
        session.wasOtpVerifiedWithin(now, this.config.passwordSetFreshnessSeconds)
      ) {
        await this.setTokens.consumeOutstandingForCustomer(customer.id, now);
        const minted = this.tokenService.mint();
        const raw = `pst_${minted.raw}`;
        await this.setTokens.save(
          PasswordSetToken.issue(
            randomUUID(),
            customer.id,
            this.tokenService.hash(raw),
            this.config.passwordSetTokenTtlSeconds,
            now,
          ),
        );
        return {
          otpRequired: false,
          setToken: raw,
          expiresIn: this.config.passwordSetTokenTtlSeconds,
        };
      }
    }

    // OTP path (FR-AUTH-036) — same cooldown/caps as every other OTP (FR-AUTH-022).
    const latest = await this.challenges.findLatestByPhone(customer.phone);
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

    const since = new Date(now.getTime() - 3600 * 1000);
    const recentCount = await this.challenges.countCreatedSince(customer.phone, since);
    if (recentCount >= this.config.otpHourlyCap) {
      throw new HttpException(
        { code: 'OTP_HOURLY_CAP', message: 'Too many OTP requests. Please try again later.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Invalidate any prior outstanding OTP for this phone (FR-AUTH-024).
    await this.challenges.consumeOutstandingForPhone(customer.phone, now);

    const code = this.otp.generateCode();
    const otpHash = await this.otp.hash(code);
    const challenge = OtpChallenge.issue(
      randomUUID(),
      customer.phone,
      otpHash,
      OtpPurpose.PASSWORD_SET,
      this.config.otpTtlSeconds,
      now,
    );
    await this.challenges.save(challenge);

    try {
      await this.dispatcher.dispatchOtp({
        phone: customer.phone,
        code,
        purpose: 'password_set',
      });
    } catch (err) {
      this.logger.error(`password-set OTP dispatch failed: ${(err as Error).message}`);
      // Same DEV-echo semantics as request-otp: without a live gateway the dispatch fails;
      // when the dev echo is on we still return the code, otherwise hard 503 (AC2 spirit).
      if (!this.config.otpDevReturn) {
        throw new HttpException(
          { code: 'SMS_UNAVAILABLE', message: "Couldn't send the code. Please try again." },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    }

    return {
      otpRequired: true,
      challengeId: challenge.id,
      expiresIn: this.config.otpTtlSeconds,
      resendAfter: this.config.otpResendCooldownSeconds,
      ...(this.config.otpDevReturn ? { devCode: code } : {}),
    };
  }
}
