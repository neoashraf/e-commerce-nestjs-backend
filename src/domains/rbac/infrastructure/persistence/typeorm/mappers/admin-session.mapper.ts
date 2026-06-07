import { AdminSession } from '../../../../domain/entities/admin-session.entity';
import { AdminSessionOrmEntity } from '../entities/admin-session.orm-entity';

export class AdminSessionMapper {
  static toDomain(o: AdminSessionOrmEntity): AdminSession {
    return new AdminSession(
      o.id,
      o.adminUserId,
      o.refreshTokenHash,
      o.deviceLabel ?? null,
      o.expiresAt,
      o.revokedAt ?? null,
      o.createdAt,
    );
  }

  static toOrm(d: AdminSession): AdminSessionOrmEntity {
    const o = new AdminSessionOrmEntity();
    o.id = d.id;
    o.adminUserId = d.adminUserId;
    o.refreshTokenHash = d.refreshTokenHash;
    o.deviceLabel = d.deviceLabel;
    o.expiresAt = d.expiresAt;
    o.revokedAt = d.revokedAt;
    return o;
  }
}
