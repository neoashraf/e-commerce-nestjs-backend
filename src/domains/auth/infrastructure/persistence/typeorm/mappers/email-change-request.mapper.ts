import { EmailChangeRequest } from '../../../../domain/entities/email-change-request.entity';
import { EmailChangeRequestOrmEntity } from '../entities/email-change-request.orm-entity';

export class EmailChangeRequestMapper {
  static toDomain(o: EmailChangeRequestOrmEntity): EmailChangeRequest {
    return new EmailChangeRequest(
      o.id,
      o.customerId,
      o.newEmail,
      o.tokenHash,
      new Date(o.expiresAt),
      o.consumedAt ? new Date(o.consumedAt) : null,
      new Date(o.createdAt),
    );
  }

  static toOrm(d: EmailChangeRequest): EmailChangeRequestOrmEntity {
    const o = new EmailChangeRequestOrmEntity();
    o.id = d.id;
    o.customerId = d.customerId;
    o.newEmail = d.newEmail;
    o.tokenHash = d.tokenHash;
    o.expiresAt = d.expiresAt;
    o.consumedAt = d.consumedAt;
    return o;
  }
}
