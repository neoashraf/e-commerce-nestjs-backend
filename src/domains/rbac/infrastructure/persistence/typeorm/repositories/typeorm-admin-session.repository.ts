import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { AdminSession } from '../../../../domain/entities/admin-session.entity';
import { IAdminSessionRepository } from '../../../../domain/repositories/admin-session.repository.interface';
import { AdminSessionOrmEntity } from '../entities/admin-session.orm-entity';
import { AdminSessionMapper } from '../mappers/admin-session.mapper';

@Injectable()
export class TypeOrmAdminSessionRepository implements IAdminSessionRepository {
  constructor(
    @InjectRepository(AdminSessionOrmEntity)
    private readonly repo: Repository<AdminSessionOrmEntity>,
  ) {}

  async findByRefreshTokenHash(hash: string): Promise<AdminSession | null> {
    const orm = await this.repo.findOne({ where: { refreshTokenHash: hash } });
    return orm ? AdminSessionMapper.toDomain(orm) : null;
  }

  async save(session: AdminSession): Promise<AdminSession> {
    const saved = await this.repo.save(AdminSessionMapper.toOrm(session));
    return AdminSessionMapper.toDomain(saved);
  }

  async revokeAllForAdmin(adminUserId: string, now: Date): Promise<void> {
    await this.repo.update({ adminUserId, revokedAt: IsNull() }, { revokedAt: now });
  }
}
