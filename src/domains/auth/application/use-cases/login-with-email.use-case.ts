import { randomUUID } from 'crypto';
import {
  HttpException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';

import { Session } from '../../domain/entities/session.entity';
import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../domain/repositories/customer.repository.interface';
import {
  ISessionRepository,
  SESSION_REPOSITORY,
} from '../../domain/repositories/session.repository.interface';
import { AUTH_CONFIG, AuthConfig } from '../ports/auth-config.port';
import { IPasswordHasher, PASSWORD_HASHER } from '../ports/password-hasher.port';
import { ITokenService, TOKEN_SERVICE } from '../ports/token-service.port';
import { MfaLoginGateService } from '../../../mfa/application/services/mfa-login-gate.service';
import { MfaChallengeView } from '../../../mfa/application/mfa-results';
import { MfaChannel } from '../../../mfa/domain/enums/mfa-channel.enum';

/** HTTP 423 Locked is not in Nest's HttpStatus enum. */
const HTTP_LOCKED = 423;

export interface LoginWithEmailCommand {
  email: string;
  password: string;
  deviceLabel?: string | null;
}

/** Normal login result — a full session is granted. */
export interface LoginWithEmailSuccess {
  mfaRequired: false;
  customer: { id: string };
  tokens: { accessToken: string; refreshToken: string; expiresIn: number };
}

/** A second factor is required (FR-MFA-010): tokens withheld, pre-auth token + challenge issued. */
export interface LoginWithEmailMfaRequired {
  mfaRequired: true;
  preAuthToken: string;
  challenge: MfaChallengeView;
  availableChannels: MfaChannel[];
}

export type LoginWithEmailResult = LoginWithEmailSuccess | LoginWithEmailMfaRequired;

/** Email + password login with brute-force lockout (FR-AUTH-011, 012). */
@Injectable()
export class LoginWithEmailUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: ISessionRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(TOKEN_SERVICE) private readonly tokens: ITokenService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    // Optional so the use-case still works if the MFA providers aren't registered (e.g. in unit
    // tests). When present (normal app wiring) it gates 2FA-enabled/mandatory accounts.
    @Optional() private readonly mfaGate?: MfaLoginGateService,
  ) {}

  async execute(command: LoginWithEmailCommand): Promise<LoginWithEmailResult> {
    const now = new Date();
    const email = command.email.trim().toLowerCase();
    const customer = await this.customers.findActiveByEmail(email);

    // Unknown email / no password (phone-only account) → invalid creds, no enumeration.
    if (!customer || !customer.passwordHash) {
      throw this.invalidCredentials();
    }

    if (customer.isLocked(now)) {
      throw this.lockedException(customer.lockedUntil, now);
    }

    const matches = await this.hasher.compare(command.password, customer.passwordHash);
    if (!matches) {
      customer.registerFailedLogin(now, this.config.loginMaxAttempts, this.config.loginLockoutMinutes);
      await this.customers.save(customer);
      if (customer.isLocked(now)) {
        throw this.lockedException(customer.lockedUntil, now);
      }
      throw this.invalidCredentials();
    }

    customer.registerSuccessfulLogin(now);
    await this.customers.save(customer);

    // Second-factor gate (FR-MFA-010): if 2FA is required, withhold tokens and return a challenge
    // + pre-auth token instead. The customer completes login via POST /auth/mfa/verify.
    if (this.mfaGate) {
      const started = await this.mfaGate.startIfRequired(customer, now);
      if (started) {
        return {
          mfaRequired: true,
          preAuthToken: started.preAuthToken,
          challenge: started.challenge,
          availableChannels: started.availableChannels,
        };
      }
    }

    const sessionId = randomUUID();
    const access = await this.tokens.signAccessToken(customer.id, sessionId);
    const refresh = this.tokens.mintRefreshToken(now);
    await this.sessions.save(
      Session.issue(
        sessionId,
        customer.id,
        refresh.hash,
        refresh.expiresAt,
        now,
        command.deviceLabel ?? null,
      ),
    );

    return {
      mfaRequired: false,
      customer: { id: customer.id },
      tokens: {
        accessToken: access.token,
        refreshToken: refresh.raw,
        expiresIn: access.expiresIn,
      },
    };
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    });
  }

  private lockedException(lockedUntil: Date | null, now: Date): HttpException {
    const retryAfter = lockedUntil
      ? Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000))
      : this.config.loginLockoutMinutes * 60;
    return new HttpException(
      {
        code: 'ACCOUNT_LOCKED',
        message: 'Account temporarily locked after repeated failures. Try again later.',
        retry_after: retryAfter,
      },
      HTTP_LOCKED,
    );
  }
}
