import { EmailVerificationToken } from '../../../../domain/entities/email-verification-token.entity';
import { EmailVerificationTokenOrmEntity } from '../entities/email-verification-token.orm-entity';

export class EmailVerificationTokenMapper {
  static toDomain(o: EmailVerificationTokenOrmEntity): EmailVerificationToken {
    return new EmailVerificationToken(
      o.id,
      o.customerId,
      o.tokenHash,
      new Date(o.expiresAt),
      o.consumedAt ? new Date(o.consumedAt) : null,
      new Date(o.createdAt),
    );
  }

  static toOrm(d: EmailVerificationToken): EmailVerificationTokenOrmEntity {
    const o = new EmailVerificationTokenOrmEntity();
    o.id = d.id;
    o.customerId = d.customerId;
    o.tokenHash = d.tokenHash;
    o.expiresAt = d.expiresAt;
    o.consumedAt = d.consumedAt;
    return o;
  }
}
