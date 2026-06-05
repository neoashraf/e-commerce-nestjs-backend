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
}
