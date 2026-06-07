import { Session } from '../../../../domain/entities/session.entity';
import { SessionOrmEntity } from '../entities/session.orm-entity';

export class SessionMapper {
  static toDomain(o: SessionOrmEntity): Session {
    return new Session(
      o.id,
      o.customerId,
      o.refreshTokenHash,
      o.deviceLabel,
      new Date(o.expiresAt),
      o.revokedAt ? new Date(o.revokedAt) : null,
      new Date(o.createdAt),
    );
  }

  static toOrm(d: Session): SessionOrmEntity {
    const o = new SessionOrmEntity();
    o.id = d.id;
    o.customerId = d.customerId;
    o.refreshTokenHash = d.refreshTokenHash;
    o.deviceLabel = d.deviceLabel;
    o.expiresAt = d.expiresAt;
    o.revokedAt = d.revokedAt;
    return o;
  }
}
