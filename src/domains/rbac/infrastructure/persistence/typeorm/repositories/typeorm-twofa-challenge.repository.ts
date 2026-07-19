import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';

import { TwofaChallenge } from '../../../../domain/entities/twofa-challenge.entity';
import { TwofaPurpose } from '../../../../domain/enums/twofa-purpose.enum';
import { ITwofaChallengeRepository } from '../../../../domain/repositories/twofa-challenge.repository.interface';
import { TwofaChallengeOrmEntity } from '../entities/twofa-challenge.orm-entity';
import { TwofaChallengeMapper } from '../mappers/twofa-challenge.mapper';

@Injectable()
export class TypeOrmTwofaChallengeRepository implements ITwofaChallengeRepository {
  constructor(
    @InjectRepository(TwofaChallengeOrmEntity)
    private readonly repo: Repository<TwofaChallengeOrmEntity>,
  ) {}

  async findById(id: string): Promise<TwofaChallenge | null> {
    const orm = await this.repo.findOne({ where: { id } });
    return orm ? TwofaChallengeMapper.toDomain(orm) : null;
  }

  async save(challenge: TwofaChallenge): Promise<TwofaChallenge> {
    const saved = await this.repo.save(TwofaChallengeMapper.toOrm(challenge));
    return TwofaChallengeMapper.toDomain(saved);
  }

  async findLatestByAdmin(adminUserId: string): Promise<TwofaChallenge | null> {
    const orm = await this.repo.findOne({ where: { adminUserId }, order: { createdAt: 'DESC' } });
    return orm ? TwofaChallengeMapper.toDomain(orm) : null;
  }

  async findLatestByAdminAndPurpose(
    adminUserId: string,
    purpose: TwofaPurpose,
  ): Promise<TwofaChallenge | null> {
    const orm = await this.repo.findOne({
      where: { adminUserId, purpose },
      order: { createdAt: 'DESC' },
    });
    return orm ? TwofaChallengeMapper.toDomain(orm) : null;
  }

  async countCreatedSince(adminUserId: string, since: Date): Promise<number> {
    return this.repo.count({ where: { adminUserId, createdAt: MoreThanOrEqual(since) } });
  }
}
