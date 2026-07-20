import { MfaPreAuth } from '../../../../domain/entities/mfa-pre-auth.entity';
import { MfaPreAuthOrmEntity } from '../entities/mfa-pre-auth.orm-entity';

export class MfaPreAuthMapper {
  static toDomain(o: MfaPreAuthOrmEntity): MfaPreAuth {
    return new MfaPreAuth(
      o.id,
      o.customerId,
      o.challengeId,
      o.tokenHash,
      new Date(o.expiresAt),
      o.consumedAt ? new Date(o.consumedAt) : null,
      new Date(o.createdAt),
    );
  }

  static toOrm(d: MfaPreAuth): MfaPreAuthOrmEntity {
    const o = new MfaPreAuthOrmEntity();
    o.id = d.id;
    o.customerId = d.customerId;
    o.challengeId = d.challengeId;
    o.tokenHash = d.tokenHash;
    o.expiresAt = d.expiresAt;
    o.consumedAt = d.consumedAt;
    return o;
  }
}
