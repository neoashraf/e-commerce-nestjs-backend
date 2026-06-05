import { AdminUser } from '../../../../domain/entities/admin-user.entity';
import { AdminUserStatus } from '../../../../domain/enums/admin-user-status.enum';
import { TwofaChannel } from '../../../../domain/enums/twofa-channel.enum';
import { AdminUserOrmEntity } from '../entities/admin-user.orm-entity';

export class AdminUserMapper {
  static toDomain(o: AdminUserOrmEntity): AdminUser {
    return new AdminUser(
      o.id,
      o.fullName,
      o.email,
      o.phone ?? null,
      o.passwordHash ?? null,
      o.roleId,
      o.twofaEnabled,
      (o.twofaChannel as TwofaChannel | null) ?? null,
      o.status as AdminUserStatus,
      o.failedLoginAttempts,
      o.lockedUntil ?? null,
      o.lastLoginAt ?? null,
      o.createdAt,
      o.updatedAt,
      o.deletedAt ?? null,
    );
  }

  static toOrm(d: AdminUser): AdminUserOrmEntity {
    const o = new AdminUserOrmEntity();
    o.id = d.id;
    o.fullName = d.fullName;
    o.email = d.email;
    o.phone = d.phone;
    o.passwordHash = d.passwordHash;
    o.roleId = d.roleId;
    o.twofaEnabled = d.twofaEnabled;
    o.twofaChannel = d.twofaChannel;
    o.status = d.status;
    o.failedLoginAttempts = d.failedLoginAttempts;
    o.lockedUntil = d.lockedUntil;
    o.lastLoginAt = d.lastLoginAt;
    o.deletedAt = d.deletedAt;
    return o;
  }
}
