import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TwofaChallenge } from '../../../../domain/entities/twofa-challenge.entity';
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
}
