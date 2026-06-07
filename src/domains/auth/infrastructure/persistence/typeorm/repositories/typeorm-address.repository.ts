import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { Address } from '../../../../domain/entities/address.entity';
import { IAddressRepository } from '../../../../domain/repositories/address.repository.interface';
import { AddressOrmEntity } from '../entities/address.orm-entity';
import { AddressMapper } from '../mappers/address.mapper';

@Injectable()
export class TypeOrmAddressRepository implements IAddressRepository {
  constructor(
    @InjectRepository(AddressOrmEntity)
    private readonly repo: Repository<AddressOrmEntity>,
  ) {}

  async findById(id: string): Promise<Address | null> {
    const orm = await this.repo.findOne({ where: { id } });
    return orm ? AddressMapper.toDomain(orm) : null;
  }

  async findByCustomerId(customerId: string): Promise<Address[]> {
    const rows = await this.repo.find({
      where: { customerId },
      // Default first; then most-recently-used so default promotion picks rows[0] (FR-AUTH-053).
      order: { isDefault: 'DESC', lastUsedAt: 'DESC', createdAt: 'DESC' },
    });
    return rows.map(AddressMapper.toDomain);
  }

  async save(address: Address): Promise<Address> {
    const saved = await this.repo.save(AddressMapper.toOrm(address));
    return AddressMapper.toDomain(saved);
  }

  async clearDefault(customerId: string): Promise<void> {
    await this.repo.update(
      { customerId, isDefault: true, deletedAt: IsNull() },
      { isDefault: false },
    );
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }
}
