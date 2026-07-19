import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Session } from '../../domain/entities/session.entity';
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
  ISessionRepository,
  SESSION_REPOSITORY,
} from '../../domain/repositories/session.repository.interface';
import { AUTH_CONFIG, AuthConfig } from '../ports/auth-config.port';
import { IOtpService, OTP_SERVICE } from '../ports/otp-service.port';
import { IPasswordHasher, PASSWORD_HASHER } from '../ports/password-hasher.port';
import { ITokenService, TOKEN_SERVICE } from '../ports/token-service.port';

/** HTTP 423 Locked is not in Nest's HttpStatus enum. */
const HTTP_LOCKED = 423;

export interface ClaimAccountCommand {
  challengeId: string;
  code: string;
  password?: string;
}

export interface ClaimAccountResult {
  customer: { id: string; isLightweight: boolean; phoneVerified: boolean };
  tokens: { accessToken: string; refreshToken: string; expiresIn: number };
}

/**
 * Claim/activate an auto-created lightweight account (FR-AUTH-071/072/073): verify an OTP
 * for the account phone, optionally set a password, flip `is_lightweight=false` +
 * `phone_verified=true`, and issue tokens — preserving order history. A phone already on a
 * FULL account → 409 ACCOUNT_EXISTS.
 */
@Injectable()
export class ClaimAccountUseCase {
  constructor(
    @Inject(OTP_CHALLENGE_REPOSITORY) private readonly challenges: IOtpChallengeRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: ISessionRepository,
    @Inject(OTP_SERVICE) private readonly otp: IOtpService,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(TOKEN_SERVICE) private readonly tokens: ITokenService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async execute(command: ClaimAccountCommand): Promise<ClaimAccountResult> {
    const now = new Date();

    // A password (if supplied) must satisfy the policy before consuming the OTP.
    if (command.password !== undefined && !isValidCustomerPassword(command.password)) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: 'Password must be at least 8 characters and include a letter and a number.',
      });
    }

    const challenge = await this.challenges.findById(command.challengeId);
    if (!challenge) {
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

    const matches = await this.otp.compare(command.code, challenge.otpHash);
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
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'No account found for this phone number.',
      });
    }
    if (!customer.isLightweight) {
      // Already a full account — claim is a no-op; direct the user to log in (FR-AUTH-072).
      throw new ConflictException({ code: 'ACCOUNT_EXISTS', message: 'Please log in instead.' });
    }

    challenge.consume(now);
    await this.challenges.save(challenge);

    customer.activate(now);
    if (command.password !== undefined) {
      customer.setPassword(await this.hasher.hash(command.password), now);
    }
    const saved = await this.customers.save(customer);

    const sessionId = randomUUID();
    const access = await this.tokens.signAccessToken(saved.id, sessionId);
    const refresh = this.tokens.mintRefreshToken(now);
    await this.sessions.save(
      // otpVerifiedAt = now: the claim was proven by a phone OTP (FR-AUTH-037).
      Session.issue(sessionId, saved.id, refresh.hash, refresh.expiresAt, now, null, now),
    );

    return {
      customer: { id: saved.id, isLightweight: saved.isLightweight, phoneVerified: saved.phoneVerified },
      tokens: { accessToken: access.token, refreshToken: refresh.raw, expiresIn: access.expiresIn },
    };
  }
}
