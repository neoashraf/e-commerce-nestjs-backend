import { PasswordSetToken } from '../../../../domain/entities/password-set-token.entity';
import { PasswordSetTokenOrmEntity } from '../entities/password-set-token.orm-entity';

export class PasswordSetTokenMapper {
  static toDomain(o: PasswordSetTokenOrmEntity): PasswordSetToken {
    return new PasswordSetToken(
      o.id,
      o.customerId,
      o.tokenHash,
      new Date(o.expiresAt),
      o.consumedAt ? new Date(o.consumedAt) : null,
      new Date(o.createdAt),
    );
  }

  static toOrm(d: PasswordSetToken): PasswordSetTokenOrmEntity {
    const o = new PasswordSetTokenOrmEntity();
    o.id = d.id;
    o.customerId = d.customerId;
    o.tokenHash = d.tokenHash;
    o.expiresAt = d.expiresAt;
    o.consumedAt = d.consumedAt;
    return o;
  }
}
