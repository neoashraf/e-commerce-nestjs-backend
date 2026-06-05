import { EmailVerificationToken } from '../entities/email-verification-token.entity';

export interface IEmailVerificationTokenRepository {
  findByTokenHash(hash: string): Promise<EmailVerificationToken | null>;
  /** Most recently created token for a customer (for the resend cooldown). */
  findLatestByCustomer(customerId: string): Promise<EmailVerificationToken | null>;
  /** Consume all outstanding (unconsumed) tokens for a customer when a new one is issued. */
  consumeOutstandingForCustomer(customerId: string, now: Date): Promise<void>;
  save(token: EmailVerificationToken): Promise<EmailVerificationToken>;
}

export const EMAIL_VERIFICATION_TOKEN_REPOSITORY = Symbol('IEmailVerificationTokenRepository');
