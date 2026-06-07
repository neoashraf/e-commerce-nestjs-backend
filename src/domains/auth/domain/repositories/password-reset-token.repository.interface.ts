import { PasswordResetToken } from '../entities/password-reset-token.entity';

export interface IPasswordResetTokenRepository {
  findByTokenHash(hash: string): Promise<PasswordResetToken | null>;
  /** Consume all outstanding (unconsumed) tokens for a customer when a new one is issued. */
  consumeOutstandingForCustomer(customerId: string, now: Date): Promise<void>;
  save(token: PasswordResetToken): Promise<PasswordResetToken>;
}

export const PASSWORD_RESET_TOKEN_REPOSITORY = Symbol('IPasswordResetTokenRepository');
