import { PasswordResetToken } from '../../../../domain/entities/password-reset-token.entity';
import { PasswordResetTokenOrmEntity } from '../entities/password-reset-token.orm-entity';

export class PasswordResetTokenMapper {
  static toDomain(o: PasswordResetTokenOrmEntity): PasswordResetToken {
    return new PasswordResetToken(
      o.id,
      o.customerId,
      o.tokenHash,
      new Date(o.expiresAt),
      o.consumedAt ? new Date(o.consumedAt) : null,
      new Date(o.createdAt),
    );
  }

  static toOrm(d: PasswordResetToken): PasswordResetTokenOrmEntity {
    const o = new PasswordResetTokenOrmEntity();
    o.id = d.id;
    o.customerId = d.customerId;
    o.tokenHash = d.tokenHash;
    o.expiresAt = d.expiresAt;
    o.consumedAt = d.consumedAt;
    return o;
  }
}
