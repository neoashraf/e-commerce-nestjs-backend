import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { Attribute } from '../../../../domain/entities/attribute.entity';
import {
  AttributeListFilter,
  CreateAttributeData,
  IAttributeRepository,
  UpdateAttributeData,
} from '../../../../domain/repositories/attribute.repository.interface';
import { AttributeOrmEntity } from '../entities/attribute.orm-entity';
import { AttributeOptionOrmEntity } from '../entities/attribute-option.orm-entity';
import { AttributeMapper } from '../mappers/attribute.mapper';

/**
 * TypeORM-backed attribute repository. Option reconciliation runs inside a transaction.
 * The delete-guard reference checks (FR-CAT-055) probe the as-yet-unbuilt product value /
 * variant-option tables via `information_schema`, so they degrade to "no references" until
 * those tables land (per the brief) and light up automatically once they exist.
 */
@Injectable()
export class TypeOrmAttributeRepository implements IAttributeRepository {
  constructor(
    @InjectRepository(AttributeOrmEntity)
    private readonly attributes: Repository<AttributeOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(
    filter: AttributeListFilter,
  ): Promise<{ items: Attribute[]; total: number }> {
    const qb = this.attributes.createQueryBuilder('a');

    if (filter.type) qb.andWhere('a.type = :type', { type: filter.type });
    if (filter.filterable !== undefined)
      qb.andWhere('a.isFilterable = :filterable', { filterable: filter.filterable });
    if (filter.isRequired !== undefined)
      qb.andWhere('a.isRequired = :isRequired', { isRequired: filter.isRequired });
    if (filter.isUnique !== undefined)
      qb.andWhere('a.isUnique = :isUnique', { isUnique: filter.isUnique });
    if (filter.isUserDefined !== undefined)
      qb.andWhere('a.isUserDefined = :isUserDefined', { isUserDefined: filter.isUserDefined });
    if (filter.q) {
      qb.andWhere('(a.code ILIKE :q OR a.adminLabel ILIKE :q)', { q: `%${filter.q}%` });
    }

    qb.orderBy('a.position', 'ASC')
      .addOrderBy('a.code', 'ASC')
      .skip((filter.page - 1) * filter.limit)
      .take(filter.limit);

    const [rows, total] = await qb.getManyAndCount();
    // List rows do not need the option set (contract row shape excludes it).
    return { items: rows.map((r) => AttributeMapper.toDomain({ ...r, options: [] })), total };
  }

  async findById(id: string): Promise<Attribute | null> {
    const row = await this.attributes.findOne({ where: { id }, relations: { options: true } });
    return row ? AttributeMapper.toDomain(row) : null;
  }

  async findByCode(code: string): Promise<Attribute | null> {
    const row = await this.attributes.findOne({ where: { code }, relations: { options: true } });
    return row ? AttributeMapper.toDomain(row) : null;
  }

  async existsByCode(code: string): Promise<boolean> {
    return (await this.attributes.count({ where: { code } })) > 0;
  }

  async create(data: CreateAttributeData): Promise<Attribute> {
    const id = await this.dataSource.transaction(async (manager) => {
      const attrRepo = manager.getRepository(AttributeOrmEntity);
      const optRepo = manager.getRepository(AttributeOptionOrmEntity);

      const attr = attrRepo.create({
        code: data.code,
        adminLabel: data.adminLabel,
        type: data.type,
        isRequired: data.isRequired,
        isUnique: data.isUnique,
        isFilterable: data.isFilterable,
        isConfigurable: data.isConfigurable,
        isVisibleOnFront: data.isVisibleOnFront,
        isComparable: data.isComparable,
        isUserDefined: data.isUserDefined,
        validation: data.validation,
        defaultValue: data.defaultValue,
        position: data.position,
        isActive: data.isActive,
      });
      const saved = await attrRepo.save(attr);

      if (data.options.length > 0) {
        await optRepo.insert(
          data.options.map((o) => ({
            attributeId: saved.id,
            value: o.value,
            label: o.label,
            swatchType: o.swatchType,
            swatchValue: o.swatchValue,
            position: o.position,
          })),
        );
      }
      return saved.id;
    });

    const created = await this.findById(id);
    // findById always resolves here (just inserted in the same connection).
    return created as Attribute;
  }

  async update(data: UpdateAttributeData): Promise<Attribute> {
    await this.dataSource.transaction(async (manager) => {
      const attrRepo = manager.getRepository(AttributeOrmEntity);
      const optRepo = manager.getRepository(AttributeOptionOrmEntity);

      const patch: Partial<AttributeOrmEntity> = { type: data.type, isConfigurable: data.isConfigurable };
      if (data.adminLabel !== undefined) patch.adminLabel = data.adminLabel;
      if (data.isRequired !== undefined) patch.isRequired = data.isRequired;
      if (data.isUnique !== undefined) patch.isUnique = data.isUnique;
      if (data.isFilterable !== undefined) patch.isFilterable = data.isFilterable;
      if (data.isVisibleOnFront !== undefined) patch.isVisibleOnFront = data.isVisibleOnFront;
      if (data.isComparable !== undefined) patch.isComparable = data.isComparable;
      if (data.validation !== undefined) patch.validation = data.validation;
      if (data.defaultValue !== undefined) patch.defaultValue = data.defaultValue;
      if (data.position !== undefined) patch.position = data.position;
      if (data.isActive !== undefined) patch.isActive = data.isActive;
      await attrRepo.update({ id: data.id }, patch);

      if (data.options !== undefined) {
        // Delete the pre-validated removed options (already cleared of OPTION_IN_USE).
        if (data.removedOptionIds && data.removedOptionIds.length > 0) {
          await optRepo.delete(data.removedOptionIds);
        }
        // Upsert the desired set: rows with an id are updated, the rest inserted.
        for (const o of data.options) {
          if (o.id) {
            await optRepo.update(
              { id: o.id, attributeId: data.id },
              {
                value: o.value,
                label: o.label,
                swatchType: o.swatchType,
                swatchValue: o.swatchValue,
                position: o.position,
              },
            );
          } else {
            await optRepo.insert({
              attributeId: data.id,
              value: o.value,
              label: o.label,
              swatchType: o.swatchType,
              swatchValue: o.swatchValue,
              position: o.position,
            });
          }
        }
      }
    });

    const updated = await this.findById(data.id);
    return updated as Attribute;
  }

  async delete(id: string): Promise<void> {
    // attribute_options cascade-delete via FK.
    await this.attributes.delete({ id });
  }

  async isAttributeReferenced(id: string): Promise<boolean> {
    return this.hasReference('attribute_id', id);
  }

  async isOptionReferenced(optionId: string): Promise<boolean> {
    return this.hasReference('option_id', optionId);
  }

  /**
   * Counts references to an attribute/option across the product value + variant-option tables.
   * Those tables are introduced by later CAT briefs; until then the probe finds no table and
   * returns false, so the guard correctly reports "no references".
   */
  private async hasReference(column: string, value: string): Promise<boolean> {
    const manager: EntityManager = this.dataSource.manager;
    const candidates: Array<{ table: string; col: string }> = [
      { table: 'product_attribute_values', col: column },
      { table: 'product_variant_options', col: column === 'attribute_id' ? 'attribute_id' : 'option_id' },
    ];
    for (const { table, col } of candidates) {
      if (!(await this.tableHasColumn(manager, table, col))) continue;
      const rows = await manager.query(
        `SELECT 1 FROM "${table}" WHERE "${col}" = $1 LIMIT 1`,
        [value],
      );
      if (rows.length > 0) return true;
    }
    return false;
  }

  private async tableHasColumn(
    manager: EntityManager,
    table: string,
    column: string,
  ): Promise<boolean> {
    const rows = await manager.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 LIMIT 1`,
      [table, column],
    );
    return rows.length > 0;
  }
}
