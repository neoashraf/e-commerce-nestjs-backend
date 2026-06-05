import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { Role } from '../../../../domain/entities/role.entity';
import { IRoleRepository } from '../../../../domain/repositories/role.repository.interface';
import { RoleOrmEntity } from '../entities/role.orm-entity';
import { RolePermissionOrmEntity } from '../entities/role-permission.orm-entity';
import { RoleMapper } from '../mappers/role.mapper';

@Injectable()
export class TypeOrmRoleRepository implements IRoleRepository {
  constructor(
    @InjectRepository(RoleOrmEntity)
    private readonly roles: Repository<RoleOrmEntity>,
    @InjectRepository(RolePermissionOrmEntity)
    private readonly rolePermissions: Repository<RolePermissionOrmEntity>,
  ) {}

  async findById(id: string): Promise<Role | null> {
    const orm = await this.roles.findOne({ where: { id, deletedAt: IsNull() } });
    return orm ? RoleMapper.toDomain(orm) : null;
  }

  async findByName(name: string): Promise<Role | null> {
    const orm = await this.roles.findOne({ where: { name, deletedAt: IsNull() } });
    return orm ? RoleMapper.toDomain(orm) : null;
  }

  async findAll(): Promise<Role[]> {
    const rows = await this.roles.find({ where: { deletedAt: IsNull() }, order: { name: 'ASC' } });
    return rows.map(RoleMapper.toDomain);
  }

  async findPermissionCodes(roleId: string): Promise<string[]> {
    const rows = await this.rolePermissions.find({ where: { roleId } });
    return rows.map((r) => r.permissionCode);
  }

  async saveRole(role: Role): Promise<Role> {
    const saved = await this.roles.save(RoleMapper.toOrm(role));
    return RoleMapper.toDomain(saved);
  }

  async replacePermissions(roleId: string, codes: string[]): Promise<void> {
    await this.rolePermissions.delete({ roleId });
    if (codes.length > 0) {
      await this.rolePermissions.insert(
        codes.map((permissionCode) => ({ roleId, permissionCode })),
      );
    }
  }

  async softDeleteRole(roleId: string, now: Date): Promise<void> {
    await this.roles.update({ id: roleId }, { deletedAt: now });
  }
}
