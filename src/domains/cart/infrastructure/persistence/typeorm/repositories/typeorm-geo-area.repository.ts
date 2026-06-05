import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GeoArea } from '../../../../domain/entities/geo-area.entity';
import { DeliveryZone } from '../../../../domain/enums/delivery-zone.enum';
import {
  IGeoAreaRepository,
} from '../../../../domain/repositories/geo-area.repository.interface';
import { GeoAreaOrmEntity } from '../entities/geo-area.orm-entity';
import { GeoAreaMapper } from '../mappers/geo-area.mapper';

/** TypeORM-backed GeoArea repository (SRS 04 §5.6). Cascading reads filter to active rows. */
@Injectable()
export class TypeOrmGeoAreaRepository implements IGeoAreaRepository {
  constructor(
    @InjectRepository(GeoAreaOrmEntity)
    private readonly areas: Repository<GeoAreaOrmEntity>,
  ) {}

  async listDivisions(): Promise<string[]> {
    const rows = await this.areas
      .createQueryBuilder('g')
      .select('DISTINCT g.division', 'division')
      .where('g.is_active = :active', { active: true })
      .orderBy('g.division', 'ASC')
      .getRawMany<{ division: string }>();
    return rows.map((r) => r.division);
  }

  async listDistricts(division: string): Promise<string[]> {
    const rows = await this.areas
      .createQueryBuilder('g')
      .select('DISTINCT g.district', 'district')
      .where('g.is_active = :active', { active: true })
      .andWhere('g.division = :division', { division })
      .orderBy('g.district', 'ASC')
      .getRawMany<{ district: string }>();
    return rows.map((r) => r.district);
  }

  async listAreas(district: string): Promise<GeoArea[]> {
    const rows = await this.areas.find({
      where: { district, isActive: true },
      order: { upazila: 'ASC' },
    });
    return rows.map(GeoAreaMapper.toDomain);
  }

  async resolveArea(district: string, upazila: string): Promise<GeoArea | null> {
    const row = await this.areas.findOne({
      where: { district, upazila, isActive: true },
    });
    return row ? GeoAreaMapper.toDomain(row) : null;
  }

  async findById(id: string): Promise<GeoArea | null> {
    const row = await this.areas.findOne({ where: { id } });
    return row ? GeoAreaMapper.toDomain(row) : null;
  }

  async updateZone(id: string, zone: DeliveryZone): Promise<GeoArea> {
    const row = await this.areas.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException({ code: 'GEO_AREA_NOT_FOUND', message: `Geo area ${id} not found` });
    }
    row.deliveryZone = zone;
    const saved = await this.areas.save(row);
    return GeoAreaMapper.toDomain(saved);
  }
}
