import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PasswordResetToken } from '../../../../domain/entities/password-reset-token.entity';
import { IPasswordResetTokenRepository } from '../../../../domain/repositories/password-reset-token.repository.interface';
import { PasswordResetTokenOrmEntity } from '../entities/password-reset-token.orm-entity';
import { PasswordResetTokenMapper } from '../mappers/password-reset-token.mapper';

@Injectable()
export class TypeOrmPasswordResetTokenRepository implements IPasswordResetTokenRepository {
  constructor(
    @InjectRepository(PasswordResetTokenOrmEntity)
    private readonly repo: Repository<PasswordResetTokenOrmEntity>,
  ) {}

  async findByTokenHash(hash: string): Promise<PasswordResetToken | null> {
    const orm = await this.repo.findOne({ where: { tokenHash: hash } });
    return orm ? PasswordResetTokenMapper.toDomain(orm) : null;
  }

  async save(token: PasswordResetToken): Promise<PasswordResetToken> {
    const saved = await this.repo.save(PasswordResetTokenMapper.toOrm(token));
    return PasswordResetTokenMapper.toDomain(saved);
  }
}
