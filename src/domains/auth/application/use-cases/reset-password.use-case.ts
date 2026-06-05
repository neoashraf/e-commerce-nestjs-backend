import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';

import { isValidCustomerPassword } from '../../domain/password-policy';
import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../domain/repositories/customer.repository.interface';
import {
  IPasswordResetTokenRepository,
  PASSWORD_RESET_TOKEN_REPOSITORY,
} from '../../domain/repositories/password-reset-token.repository.interface';
import {
  ISessionRepository,
  SESSION_REPOSITORY,
} from '../../domain/repositories/session.repository.interface';
import { IPasswordHasher, PASSWORD_HASHER } from '../ports/password-hasher.port';
import {
  IVerificationTokenService,
  VERIFICATION_TOKEN_SERVICE,
} from '../ports/verification-token.port';

export interface ResetPasswordCommand {
  token: string;
  newPassword: string;
}

/**
 * Reset a password with a single-use token (FR-AUTH-033/035): validates the policy
 * (weak → 400), consumes the token (expired/reused → 410), sets the new hash, and
 * revokes ALL active sessions (AC3).
 */
@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly tokens: IPasswordResetTokenRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: ISessionRepository,
    @Inject(VERIFICATION_TOKEN_SERVICE) private readonly tokenService: IVerificationTokenService,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
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

    const hash = this.tokenService.hash(command.token);
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

    customer.setPassword(await this.hasher.hash(command.newPassword), now);
    await this.customers.save(customer);

    // Revoke every active session on a successful reset (FR-AUTH-035).
    await this.sessions.revokeAllForCustomer(customer.id, now);
  }
}
