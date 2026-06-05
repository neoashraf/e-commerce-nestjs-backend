import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThanOrEqual, Repository } from 'typeorm';

import { OtpChallenge } from '../../../../domain/entities/otp-challenge.entity';
import { IOtpChallengeRepository } from '../../../../domain/repositories/otp-challenge.repository.interface';
import { OtpChallengeOrmEntity } from '../entities/otp-challenge.orm-entity';
import { OtpChallengeMapper } from '../mappers/otp-challenge.mapper';

@Injectable()
export class TypeOrmOtpChallengeRepository implements IOtpChallengeRepository {
  constructor(
    @InjectRepository(OtpChallengeOrmEntity)
    private readonly repo: Repository<OtpChallengeOrmEntity>,
  ) {}

  async findById(id: string): Promise<OtpChallenge | null> {
    const orm = await this.repo.findOne({ where: { id } });
    return orm ? OtpChallengeMapper.toDomain(orm) : null;
  }

  async save(challenge: OtpChallenge): Promise<OtpChallenge> {
    const saved = await this.repo.save(OtpChallengeMapper.toOrm(challenge));
    return OtpChallengeMapper.toDomain(saved);
  }

  async findLatestByPhone(phone: string): Promise<OtpChallenge | null> {
    const orm = await this.repo.findOne({ where: { phone }, order: { createdAt: 'DESC' } });
    return orm ? OtpChallengeMapper.toDomain(orm) : null;
  }

  async countCreatedSince(phone: string, since: Date): Promise<number> {
    return this.repo.count({ where: { phone, createdAt: MoreThanOrEqual(since) } });
  }

  async consumeOutstandingForPhone(phone: string, now: Date): Promise<void> {
    await this.repo.update({ phone, consumedAt: IsNull() }, { consumedAt: now });
  }
}
