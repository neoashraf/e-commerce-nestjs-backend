import { randomUUID } from 'crypto';
import { HttpException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';

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

/** HTTP 423 Locked is not in Nest's HttpStatus enum. */
const HTTP_LOCKED = 423;

export interface LoginWithEmailCommand {
  email: string;
  password: string;
  deviceLabel?: string | null;
}

export interface LoginWithEmailResult {
  customer: { id: string };
  tokens: { accessToken: string; refreshToken: string; expiresIn: number };
}

/** Email + password login with brute-force lockout (FR-AUTH-011, 012). */
@Injectable()
export class LoginWithEmailUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: ISessionRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(TOKEN_SERVICE) private readonly tokens: ITokenService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async execute(command: LoginWithEmailCommand): Promise<LoginWithEmailResult> {
    const now = new Date();
    const email = command.email.trim().toLowerCase();
    const customer = await this.customers.findActiveByEmail(email);

    // Unknown email / no password (phone-only or lightweight) → invalid creds, no enumeration.
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

    const access = await this.tokens.signAccessToken(customer.id);
    const refresh = this.tokens.mintRefreshToken(now);
    await this.sessions.save(
      Session.issue(
        randomUUID(),
        customer.id,
        refresh.hash,
        refresh.expiresAt,
        now,
        command.deviceLabel ?? null,
      ),
    );

    return {
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
