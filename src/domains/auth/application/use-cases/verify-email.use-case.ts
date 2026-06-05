import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';

import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../domain/repositories/customer.repository.interface';
import {
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  IEmailVerificationTokenRepository,
} from '../../domain/repositories/email-verification-token.repository.interface';
import {
  IVerificationTokenService,
  VERIFICATION_TOKEN_SERVICE,
} from '../ports/verification-token.port';

export interface VerifyEmailCommand {
  token: string;
}

export interface VerifyEmailResult {
  emailVerified: boolean;
}

/** Confirm an email-verification link (FR-AUTH-043); expired/reused → 410 Gone. */
@Injectable()
export class VerifyEmailUseCase {
  constructor(
    @Inject(EMAIL_VERIFICATION_TOKEN_REPOSITORY)
    private readonly tokens: IEmailVerificationTokenRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    @Inject(VERIFICATION_TOKEN_SERVICE) private readonly tokenService: IVerificationTokenService,
  ) {}

  async execute(command: VerifyEmailCommand): Promise<VerifyEmailResult> {
    const now = new Date();
    const hash = this.tokenService.hash(command.token);
    const token = await this.tokens.findByTokenHash(hash);

    if (!token || !token.isUsable(now)) {
      throw new HttpException(
        { code: 'VERIFICATION_INVALID', message: 'This verification link has expired or already been used.' },
        HttpStatus.GONE,
      );
    }

    token.consume(now);
    await this.tokens.save(token);

    const customer = await this.customers.findById(token.customerId);
    if (!customer) {
      throw new HttpException(
        { code: 'VERIFICATION_INVALID', message: 'This verification link has expired or already been used.' },
        HttpStatus.GONE,
      );
    }

    if (!customer.emailVerified) {
      customer.markEmailVerified(now);
      await this.customers.save(customer);
    }

    return { emailVerified: true };
  }
}
