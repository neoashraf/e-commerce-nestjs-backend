import { PasswordResetToken } from '../entities/password-reset-token.entity';

export interface IPasswordResetTokenRepository {
  findByTokenHash(hash: string): Promise<PasswordResetToken | null>;
  save(token: PasswordResetToken): Promise<PasswordResetToken>;
}

export const PASSWORD_RESET_TOKEN_REPOSITORY = Symbol('IPasswordResetTokenRepository');
