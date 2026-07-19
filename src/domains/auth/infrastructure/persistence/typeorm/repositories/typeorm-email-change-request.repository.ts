import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { EmailChangeRequest } from '../../../../domain/entities/email-change-request.entity';
import { IEmailChangeRequestRepository } from '../../../../domain/repositories/email-change-request.repository.interface';
import { EmailChangeRequestOrmEntity } from '../entities/email-change-request.orm-entity';
import { EmailChangeRequestMapper } from '../mappers/email-change-request.mapper';

@Injectable()
export class TypeOrmEmailChangeRequestRepository implements IEmailChangeRequestRepository {
  constructor(
    @InjectRepository(EmailChangeRequestOrmEntity)
    private readonly repo: Repository<EmailChangeRequestOrmEntity>,
  ) {}

  async findById(id: string): Promise<EmailChangeRequest | null> {
    const orm = await this.repo.findOne({ where: { id } });
    return orm ? EmailChangeRequestMapper.toDomain(orm) : null;
  }

  async findLatestByCustomer(customerId: string): Promise<EmailChangeRequest | null> {
    const orm = await this.repo.findOne({
      where: { customerId },
      order: { createdAt: 'DESC' },
    });
    return orm ? EmailChangeRequestMapper.toDomain(orm) : null;
  }

  async consumeOutstandingForCustomer(customerId: string, now: Date): Promise<void> {
    await this.repo.update({ customerId, consumedAt: IsNull() }, { consumedAt: now });
  }

  async save(request: EmailChangeRequest): Promise<EmailChangeRequest> {
    const saved = await this.repo.save(EmailChangeRequestMapper.toOrm(request));
    return EmailChangeRequestMapper.toDomain(saved);
  }
}
