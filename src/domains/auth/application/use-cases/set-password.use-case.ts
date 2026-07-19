import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

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
  IPasswordSetTokenRepository,
  PASSWORD_SET_TOKEN_REPOSITORY,
} from '../../domain/repositories/password-set-token.repository.interface';
import {
  ISessionRepository,
  SESSION_REPOSITORY,
} from '../../domain/repositories/session.repository.interface';
import { AUTH_CONFIG, AuthConfig } from '../ports/auth-config.port';
import { IOtpService, OTP_SERVICE } from '../ports/otp-service.port';
import { IPasswordHasher, PASSWORD_HASHER } from '../ports/password-hasher.port';
import {
  INotificationDispatcher,
  NOTIFICATION_DISPATCHER,
} from '../ports/notification-dispatcher.port';
import {
  IVerificationTokenService,
  VERIFICATION_TOKEN_SERVICE,
} from '../ports/verification-token.port';

/** HTTP 423 Locked is not in Nest's HttpStatus enum. */
const HTTP_LOCKED = 423;

export interface SetPasswordCommand {
  customerId: string;
  newPassword: string;
  /** OTP path (FR-AUTH-036). */
  challengeId?: string;
  code?: string;
  /** Freshness path (FR-AUTH-037). */
  setToken?: string;
  /** The session id (JWT `sid`) that made this request — spared by the revoke sweep. */
  currentSessionId?: string;
}

/**
 * Create the first password for a passwordless account (FR-AUTH-036/037/038): proves the
 * request with EITHER a `password_set` OTP or a freshness `set_token`, validates the
 * policy (FR-AUTH-030), stores the bcrypt hash, revokes every OTHER session (BR-AUTH-5,
 * the current one survives) and dispatches a `password_set` confirmation.
 */
@Injectable()
export class SetPasswordUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    @Inject(OTP_CHALLENGE_REPOSITORY) private readonly challenges: IOtpChallengeRepository,
    @Inject(PASSWORD_SET_TOKEN_REPOSITORY)
    private readonly setTokens: IPasswordSetTokenRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: ISessionRepository,
    @Inject(OTP_SERVICE) private readonly otp: IOtpService,
    @Inject(VERIFICATION_TOKEN_SERVICE) private readonly tokenService: IVerificationTokenService,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(NOTIFICATION_DISPATCHER) private readonly notifier: INotificationDispatcher,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async execute(command: SetPasswordCommand): Promise<void> {
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

    if (!isValidCustomerPassword(command.newPassword)) {
      throw new HttpException(
        {
          code: 'WEAK_PASSWORD',
          message: 'Password must be at least 8 characters and include a letter and a number.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (command.setToken) {
      await this.consumeSetToken(customer, command.setToken, now);
    } else {
      await this.consumeOtp(customer, command.challengeId, command.code, now);
    }

    customer.setPassword(await this.hasher.hash(command.newPassword), now);
    await this.customers.save(customer);

    // BR-AUTH-5 / FR-AUTH-038: revoke every other session; the current one survives.
    await this.sessions.revokeAllForCustomerExcept(
      customer.id,
      command.currentSessionId ?? null,
      now,
    );

    // FR-AUTH-038: best-effort confirmation to the account's verified channels.
    await this.notifier.dispatchPasswordChanged({
      email: customer.emailVerified ? customer.email : null,
      phone: customer.phoneVerified ? customer.phone : null,
      fullName: customer.fullName,
      event: 'password_set',
    });
  }

  /** Freshness path (FR-AUTH-037): consume the single-use `set_token`; invalid/expired → 400. */
  private async consumeSetToken(customer: Customer, rawToken: string, now: Date): Promise<void> {
    const token = await this.setTokens.findByTokenHash(this.tokenService.hash(rawToken));
    if (!token || token.customerId !== customer.id || !token.isUsable(now)) {
      throw new BadRequestException({
        code: 'SET_TOKEN_INVALID',
        message: 'Invalid or expired token. Request a new one.',
      });
    }
    token.consume(now);
    await this.setTokens.save(token);
  }

  /** OTP path (FR-AUTH-036): verify a `password_set` code sent to the account phone. */
  private async consumeOtp(
    customer: Customer,
    challengeId: string | undefined,
    code: string | undefined,
    now: Date,
  ): Promise<void> {
    if (!challengeId || !code) {
      throw new BadRequestException({
        code: 'SET_PROOF_REQUIRED',
        message: 'Provide either challenge_id + code or a set_token.',
      });
    }

    const challenge = await this.challenges.findById(challengeId);
    // Purpose binding (BR-AUTH-3) + the challenge must target this account's own phone.
    if (
      !challenge ||
      challenge.purpose !== OtpPurpose.PASSWORD_SET ||
      challenge.phone !== customer.phone
    ) {
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
        HTTP_LOCKED,
      );
    }
    if (challenge.isExpired(now)) {
      throw new BadRequestException({ code: 'OTP_EXPIRED', message: 'This code has expired.' });
    }

    const matches = await this.otp.compare(code, challenge.otpHash);
    if (!matches) {
      challenge.registerFailedAttempt();
      await this.challenges.save(challenge);
      if (challenge.attemptsExhausted(this.config.otpAttemptCap)) {
        throw new HttpException(
          { code: 'OTP_LOCKED', message: 'Too many attempts. Request a new code.' },
          HTTP_LOCKED,
        );
      }
      throw new BadRequestException({ code: 'INVALID_OTP', message: 'Invalid code.' });
    }

    challenge.consume(now);
    await this.challenges.save(challenge);
  }
}
