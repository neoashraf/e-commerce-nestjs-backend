import { PasswordResetToken } from '../../../../domain/entities/password-reset-token.entity';
import { PasswordResetTokenOrmEntity } from '../entities/password-reset-token.orm-entity';

export class PasswordResetTokenMapper {
  static toDomain(o: PasswordResetTokenOrmEntity): PasswordResetToken {
    return new PasswordResetToken(
      o.id,
      o.adminUserId,
      o.tokenHash,
      o.expiresAt,
      o.usedAt ?? null,
      o.createdAt,
    );
  }

  static toOrm(d: PasswordResetToken): PasswordResetTokenOrmEntity {
    const o = new PasswordResetTokenOrmEntity();
    o.id = d.id;
    o.adminUserId = d.adminUserId;
    o.tokenHash = d.tokenHash;
    o.expiresAt = d.expiresAt;
    o.usedAt = d.usedAt;
    return o;
  }
}
