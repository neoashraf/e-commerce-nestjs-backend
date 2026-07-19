import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, IsNull, Repository } from 'typeorm';

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

  async findActiveByEmail(email: string): Promise<Customer | null> {
    const orm = await this.repo.findOne({
      where: { email: ILike(email), deletedAt: IsNull() },
    });
    return orm ? CustomerMapper.toDomain(orm) : null;
  }

  async save(customer: Customer): Promise<Customer> {
    const saved = await this.repo.save(CustomerMapper.toOrm(customer));
    return CustomerMapper.toDomain(saved);
  }

  async releaseUnverifiedEmails(cutoff: Date, now: Date): Promise<number> {
    // FR-AUTH-045: email+password registrations (password set, email unverified) older than
    // the window with no successful login since registering. Registration stamps
    // `last_login_at = created_at`, so any REAL later login moves it strictly forward.
    const result = await this.repo
      .createQueryBuilder()
      .update(CustomerOrmEntity)
      .set({ email: null, emailVerified: false, updatedAt: now })
      .where('email IS NOT NULL')
      .andWhere('email_verified = false')
      .andWhere('password_hash IS NOT NULL')
      .andWhere('deleted_at IS NULL')
      .andWhere('created_at <= :cutoff', { cutoff })
      .andWhere('(last_login_at IS NULL OR last_login_at <= created_at)')
      .execute();
    return result.affected ?? 0;
  }
}
