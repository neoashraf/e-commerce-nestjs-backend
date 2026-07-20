import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';

import { Session } from '../../../../domain/entities/session.entity';
import { ISessionRepository } from '../../../../domain/repositories/session.repository.interface';
import { SessionOrmEntity } from '../entities/session.orm-entity';
import { SessionMapper } from '../mappers/session.mapper';

@Injectable()
export class TypeOrmSessionRepository implements ISessionRepository {
  constructor(
    @InjectRepository(SessionOrmEntity)
    private readonly repo: Repository<SessionOrmEntity>,
  ) {}

  async findById(id: string): Promise<Session | null> {
    const orm = await this.repo.findOne({ where: { id } });
    return orm ? SessionMapper.toDomain(orm) : null;
  }

  async findByRefreshTokenHash(hash: string): Promise<Session | null> {
    const orm = await this.repo.findOne({ where: { refreshTokenHash: hash } });
    return orm ? SessionMapper.toDomain(orm) : null;
  }

  async save(session: Session): Promise<Session> {
    const saved = await this.repo.save(SessionMapper.toOrm(session));
    return SessionMapper.toDomain(saved);
  }

  async revokeAllForCustomer(customerId: string, now: Date): Promise<void> {
    await this.repo.update({ customerId, revokedAt: IsNull() }, { revokedAt: now });
  }

  async revokeAllForCustomerExcept(
    customerId: string,
    exceptSessionId: string | null,
    now: Date,
  ): Promise<void> {
    if (!exceptSessionId) {
      await this.repo.update({ customerId, revokedAt: IsNull() }, { revokedAt: now });
      return;
    }
    await this.repo.update(
      { customerId, revokedAt: IsNull(), id: Not(exceptSessionId) },
      { revokedAt: now },
    );
  }
}
