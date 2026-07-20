import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';

import { Customer } from '../../domain/entities/customer.entity';
import { Session } from '../../domain/entities/session.entity';
import { isValidCustomerPassword } from '../../domain/password-policy';
import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../domain/repositories/customer.repository.interface';
import {
  ISessionRepository,
  SESSION_REPOSITORY,
} from '../../domain/repositories/session.repository.interface';
import { IPasswordHasher, PASSWORD_HASHER } from '../ports/password-hasher.port';
import { ITokenService, TOKEN_SERVICE } from '../ports/token-service.port';
import { IssueEmailVerificationUseCase } from './issue-email-verification.use-case';

export interface RegisterWithEmailCommand {
  fullName: string;
  email: string;
  password: string;
  promoEmailOptIn?: boolean;
  deviceLabel?: string | null;
}

export interface RegisterWithEmailResult {
  customer: { id: string; email: string; emailVerified: boolean };
  tokens: { accessToken: string; refreshToken: string; expiresIn: number };
}

/** Email + password registration (FR-AUTH-002, 004, 006, 030, 031). */
@Injectable()
export class RegisterWithEmailUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: ISessionRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(TOKEN_SERVICE) private readonly tokens: ITokenService,
    private readonly issueEmailVerification: IssueEmailVerificationUseCase,
  ) {}

  async execute(command: RegisterWithEmailCommand): Promise<RegisterWithEmailResult> {
    const now = new Date();
    const fullName = command.fullName?.trim();
    if (!fullName || fullName.length < 2) {
      throw new BadRequestException({ code: 'INVALID_NAME', message: 'Full name is required.' });
    }

    const email = command.email.trim().toLowerCase();
    if (!isValidCustomerPassword(command.password)) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: 'Password must be at least 8 characters and include a letter and a number.',
      });
    }

    // Duplicate email → 409 (FR-AUTH-004).
    const existing = await this.customers.findActiveByEmail(email);
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_EXISTS',
        message: 'This email is already registered. Please log in instead.',
      });
    }

    const passwordHash = await this.hasher.hash(command.password);
    let customer = Customer.registerWithEmail(
      randomUUID(),
      fullName,
      email,
      passwordHash,
      command.promoEmailOptIn ?? false,
      now,
    );
    customer.markLoggedIn(now);
    customer = await this.customers.save(customer);

    // Trigger the verification email (FR-AUTH-002, 043) — non-blocking for registration.
    await this.issueEmailVerification.execute({
      customerId: customer.id,
      email: customer.email as string,
      fullName: customer.fullName,
    });

    const sessionId = randomUUID();
    const access = await this.tokens.signAccessToken(customer.id, sessionId);
    const refresh = this.tokens.mintRefreshToken(now);
    await this.sessions.save(
      Session.issue(sessionId, customer.id, refresh.hash, refresh.expiresAt, now),
    );

    return {
      customer: { id: customer.id, email: customer.email as string, emailVerified: customer.emailVerified },
      tokens: {
        accessToken: access.token,
        refreshToken: refresh.raw,
        expiresIn: access.expiresIn,
      },
    };
  }
}
