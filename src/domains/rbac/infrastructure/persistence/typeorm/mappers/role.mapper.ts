import { Role } from '../../../../domain/entities/role.entity';
import { RoleOrmEntity } from '../entities/role.orm-entity';

export class RoleMapper {
  static toDomain(o: RoleOrmEntity): Role {
    return new Role(
      o.id,
      o.name,
      o.description ?? null,
      o.isSystem,
      o.createdAt,
      o.updatedAt,
      o.deletedAt ?? null,
    );
  }

  static toOrm(d: Role): RoleOrmEntity {
    const o = new RoleOrmEntity();
    o.id = d.id;
    o.name = d.name;
    o.description = d.description;
    o.isSystem = d.isSystem;
    o.deletedAt = d.deletedAt;
    return o;
  }
}
