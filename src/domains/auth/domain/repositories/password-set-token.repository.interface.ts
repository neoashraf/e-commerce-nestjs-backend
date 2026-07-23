import { PasswordSetToken } from '../entities/password-set-token.entity';

export interface IPasswordSetTokenRepository {
  findByTokenHash(hash: string): Promise<PasswordSetToken | null>;
  /** Consume all outstanding (unconsumed) tokens for a customer when a new one is issued. */
  consumeOutstandingForCustomer(customerId: string, now: Date): Promise<void>;
  save(token: PasswordSetToken): Promise<PasswordSetToken>;
}

export const PASSWORD_SET_TOKEN_REPOSITORY = Symbol('IPasswordSetTokenRepository');
