import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MfaSettings } from '../../../../domain/entities/mfa-settings.entity';
import { IMfaSettingsRepository } from '../../../../domain/repositories/mfa-settings.repository.interface';
import { MfaSettingsOrmEntity } from '../entities/mfa-settings.orm-entity';
import { MfaSettingsMapper } from '../mappers/mfa-settings.mapper';

@Injectable()
export class TypeOrmMfaSettingsRepository implements IMfaSettingsRepository {
  constructor(
    @InjectRepository(MfaSettingsOrmEntity)
    private readonly repo: Repository<MfaSettingsOrmEntity>,
  ) {}

  async get(): Promise<MfaSettings | null> {
    const orm = await this.repo.findOne({ where: {}, order: { createdAt: 'ASC' } });
    return orm ? MfaSettingsMapper.toDomain(orm) : null;
  }

  async save(settings: MfaSettings): Promise<MfaSettings> {
    const saved = await this.repo.save(MfaSettingsMapper.toOrm(settings));
    return MfaSettingsMapper.toDomain(saved);
  }
}
