import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** Role↔permission join (SRS 16 §8 RolePermission). Composite PK (role_id, permission_code). */
@Entity('role_permissions')
@Index(['roleId'])
export class RolePermissionOrmEntity {
  @PrimaryColumn({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @PrimaryColumn({ name: 'permission_code', length: 80 })
  permissionCode: string;
}
