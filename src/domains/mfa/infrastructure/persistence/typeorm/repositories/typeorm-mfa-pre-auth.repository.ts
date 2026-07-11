import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MfaPreAuth } from '../../../../domain/entities/mfa-pre-auth.entity';
import { IMfaPreAuthRepository } from '../../../../domain/repositories/mfa-pre-auth.repository.interface';
import { MfaPreAuthOrmEntity } from '../entities/mfa-pre-auth.orm-entity';
import { MfaPreAuthMapper } from '../mappers/mfa-pre-auth.mapper';

@Injectable()
export class TypeOrmMfaPreAuthRepository implements IMfaPreAuthRepository {
  constructor(
    @InjectRepository(MfaPreAuthOrmEntity)
    private readonly repo: Repository<MfaPreAuthOrmEntity>,
  ) {}

  async findByTokenHash(tokenHash: string): Promise<MfaPreAuth | null> {
    const orm = await this.repo.findOne({ where: { tokenHash } });
    return orm ? MfaPreAuthMapper.toDomain(orm) : null;
  }

  async save(preAuth: MfaPreAuth): Promise<MfaPreAuth> {
    const saved = await this.repo.save(MfaPreAuthMapper.toOrm(preAuth));
    return MfaPreAuthMapper.toDomain(saved);
  }
}
