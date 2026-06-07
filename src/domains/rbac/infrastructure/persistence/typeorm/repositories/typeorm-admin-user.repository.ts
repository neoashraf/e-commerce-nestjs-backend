import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { AdminUser } from '../../../../domain/entities/admin-user.entity';
import { AdminUserStatus } from '../../../../domain/enums/admin-user-status.enum';
import {
  AdminUserListFilter,
  IAdminUserRepository,
} from '../../../../domain/repositories/admin-user.repository.interface';
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

  async findAll(filter: AdminUserListFilter): Promise<{ items: AdminUser[]; total: number }> {
    const qb = this.repo.createQueryBuilder('a');
    if (!filter.includeDeleted) qb.andWhere('a.deletedAt IS NULL');
    if (filter.status) qb.andWhere('a.status = :status', { status: filter.status });
    if (filter.roleId) qb.andWhere('a.roleId = :roleId', { roleId: filter.roleId });
    if (filter.search) {
      qb.andWhere('(a.fullName ILIKE :s OR a.email ILIKE :s)', { s: `%${filter.search}%` });
    }
    qb.orderBy('a.createdAt', 'DESC')
      .skip((filter.page - 1) * filter.limit)
      .take(filter.limit);
    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map(AdminUserMapper.toDomain), total };
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

  async countByRoleId(roleId: string): Promise<number> {
    return this.repo.count({ where: { roleId, deletedAt: IsNull() } });
  }
}
