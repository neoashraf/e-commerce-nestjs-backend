import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThanOrEqual, Repository } from 'typeorm';

import { MfaChallenge } from '../../../../domain/entities/mfa-challenge.entity';
import { MfaChallengePurpose } from '../../../../domain/enums/mfa-challenge-purpose.enum';
import { IMfaChallengeRepository } from '../../../../domain/repositories/mfa-challenge.repository.interface';
import { MfaChallengeOrmEntity } from '../entities/mfa-challenge.orm-entity';
import { MfaChallengeMapper } from '../mappers/mfa-challenge.mapper';

@Injectable()
export class TypeOrmMfaChallengeRepository implements IMfaChallengeRepository {
  constructor(
    @InjectRepository(MfaChallengeOrmEntity)
    private readonly repo: Repository<MfaChallengeOrmEntity>,
  ) {}

  async findById(id: string): Promise<MfaChallenge | null> {
    const orm = await this.repo.findOne({ where: { id } });
    return orm ? MfaChallengeMapper.toDomain(orm) : null;
  }

  async save(challenge: MfaChallenge): Promise<MfaChallenge> {
    const saved = await this.repo.save(MfaChallengeMapper.toOrm(challenge));
    return MfaChallengeMapper.toDomain(saved);
  }

  async findLatestByCustomerAndPurpose(
    customerId: string,
    purpose: MfaChallengePurpose,
  ): Promise<MfaChallenge | null> {
    const orm = await this.repo.findOne({
      where: { customerId, purpose },
      order: { createdAt: 'DESC' },
    });
    return orm ? MfaChallengeMapper.toDomain(orm) : null;
  }

  async findLatestByCustomer(customerId: string): Promise<MfaChallenge | null> {
    const orm = await this.repo.findOne({ where: { customerId }, order: { createdAt: 'DESC' } });
    return orm ? MfaChallengeMapper.toDomain(orm) : null;
  }

  async countCreatedSince(customerId: string, since: Date): Promise<number> {
    return this.repo.count({ where: { customerId, createdAt: MoreThanOrEqual(since) } });
  }

  async consumeOutstandingForCustomer(customerId: string, now: Date): Promise<void> {
    await this.repo.update({ customerId, consumedAt: IsNull() }, { consumedAt: now });
  }
}
