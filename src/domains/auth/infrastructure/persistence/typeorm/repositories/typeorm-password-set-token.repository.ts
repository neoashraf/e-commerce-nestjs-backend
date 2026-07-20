import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { PasswordSetToken } from '../../../../domain/entities/password-set-token.entity';
import { IPasswordSetTokenRepository } from '../../../../domain/repositories/password-set-token.repository.interface';
import { PasswordSetTokenOrmEntity } from '../entities/password-set-token.orm-entity';
import { PasswordSetTokenMapper } from '../mappers/password-set-token.mapper';

@Injectable()
export class TypeOrmPasswordSetTokenRepository implements IPasswordSetTokenRepository {
  constructor(
    @InjectRepository(PasswordSetTokenOrmEntity)
    private readonly repo: Repository<PasswordSetTokenOrmEntity>,
  ) {}

  async findByTokenHash(hash: string): Promise<PasswordSetToken | null> {
    const orm = await this.repo.findOne({ where: { tokenHash: hash } });
    return orm ? PasswordSetTokenMapper.toDomain(orm) : null;
  }

  async consumeOutstandingForCustomer(customerId: string, now: Date): Promise<void> {
    await this.repo.update({ customerId, consumedAt: IsNull() }, { consumedAt: now });
  }

  async save(token: PasswordSetToken): Promise<PasswordSetToken> {
    const saved = await this.repo.save(PasswordSetTokenMapper.toOrm(token));
    return PasswordSetTokenMapper.toDomain(saved);
  }
}
