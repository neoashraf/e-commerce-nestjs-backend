import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { AdminUser } from '../../../../domain/entities/admin-user.entity';
import { AdminUserStatus } from '../../../../domain/enums/admin-user-status.enum';
import { IAdminUserRepository } from '../../../../domain/repositories/admin-user.repository.interface';
import { AdminUserOrmEntity } from '../entities/admin-user.orm-entity';
import { AdminUserMapper } from '../mappers/admin-user.mapper';

@Injectable()
export class TypeOrmAdminUserRepository implements IAdminUserRepository {
  constructor(
    @InjectRepository(AdminUserOrmEntity)
    private readonly repo: Repository<AdminUserOrmEntity>,
  ) {}

  async findById(id: string): Promise<AdminUser | null> {
    const orm = await this.repo.findOne({ where: { id } });
    return orm ? AdminUserMapper.toDomain(orm) : null;
  }

  async findByEmail(email: string): Promise<AdminUser | null> {
    const orm = await this.repo.findOne({ where: { email, deletedAt: IsNull() } });
    return orm ? AdminUserMapper.toDomain(orm) : null;
  }

  async save(admin: AdminUser): Promise<AdminUser> {
    const saved = await this.repo.save(AdminUserMapper.toOrm(admin));
    return AdminUserMapper.toDomain(saved);
  }

  async countActiveByRoleId(roleId: string): Promise<number> {
    return this.repo.count({
      where: { roleId, status: AdminUserStatus.ACTIVE, deletedAt: IsNull() },
    });
  }
}
