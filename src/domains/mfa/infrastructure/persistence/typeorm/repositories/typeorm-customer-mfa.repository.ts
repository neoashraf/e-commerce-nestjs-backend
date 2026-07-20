import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CustomerMfa } from '../../../../domain/entities/customer-mfa.entity';
import { ICustomerMfaRepository } from '../../../../domain/repositories/customer-mfa.repository.interface';
import { CustomerMfaOrmEntity } from '../entities/customer-mfa.orm-entity';
import { CustomerMfaMapper } from '../mappers/customer-mfa.mapper';

@Injectable()
export class TypeOrmCustomerMfaRepository implements ICustomerMfaRepository {
  constructor(
    @InjectRepository(CustomerMfaOrmEntity)
    private readonly repo: Repository<CustomerMfaOrmEntity>,
  ) {}

  async findByCustomerId(customerId: string): Promise<CustomerMfa | null> {
    const orm = await this.repo.findOne({ where: { customerId } });
    return orm ? CustomerMfaMapper.toDomain(orm) : null;
  }

  async save(state: CustomerMfa): Promise<CustomerMfa> {
    const saved = await this.repo.save(CustomerMfaMapper.toOrm(state));
    return CustomerMfaMapper.toDomain(saved);
  }
}
