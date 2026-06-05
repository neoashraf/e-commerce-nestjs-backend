import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { Customer } from '../../../../domain/entities/customer.entity';
import { ICustomerRepository } from '../../../../domain/repositories/customer.repository.interface';
import { CustomerOrmEntity } from '../entities/customer.orm-entity';
import { CustomerMapper } from '../mappers/customer.mapper';

@Injectable()
export class TypeOrmCustomerRepository implements ICustomerRepository {
  constructor(
    @InjectRepository(CustomerOrmEntity)
    private readonly repo: Repository<CustomerOrmEntity>,
  ) {}

  async findById(id: string): Promise<Customer | null> {
    const orm = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    return orm ? CustomerMapper.toDomain(orm) : null;
  }

  async findActiveByPhone(phone: string): Promise<Customer | null> {
    const orm = await this.repo.findOne({ where: { phone, deletedAt: IsNull() } });
    return orm ? CustomerMapper.toDomain(orm) : null;
  }

  async save(customer: Customer): Promise<Customer> {
    const saved = await this.repo.save(CustomerMapper.toOrm(customer));
    return CustomerMapper.toDomain(saved);
  }
}
