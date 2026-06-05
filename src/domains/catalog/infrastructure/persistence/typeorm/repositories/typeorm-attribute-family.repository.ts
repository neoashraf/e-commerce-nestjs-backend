import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { AttributeFamily } from '../../../../domain/entities/attribute-family.entity';
import {
  AttributeRef,
  CreateAttributeFamilyData,
  FamilyGroupInput,
  IAttributeFamilyRepository,
  UpdateAttributeFamilyData,
} from '../../../../domain/repositories/attribute-family.repository.interface';
import { AttributeFamilyOrmEntity } from '../entities/attribute-family.orm-entity';
import { AttributeGroupOrmEntity } from '../entities/attribute-group.orm-entity';
import { AttributeOrmEntity } from '../entities/attribute.orm-entity';
import { FamilyAttributeOrmEntity } from '../entities/family-attribute.orm-entity';
import {
  AttributeFamilyMapper,
  JoinedFamilyAttributeRow,
} from '../mappers/attribute-family.mapper';

/**
 * TypeORM-backed attribute-family repository. Create/update persist the grouping inside a
 * transaction (update is a full drop-and-rebuild — FR-CAT-061). The product reference check
 * (FR-CAT-064) probes the as-yet-unbuilt `products` table via `information_schema`, so it
 * degrades to "no references" until that table lands and lights up automatically once it exists.
 */
@Injectable()
export class TypeOrmAttributeFamilyRepository implements IAttributeFamilyRepository {
  constructor(
    @InjectRepository(AttributeFamilyOrmEntity)
    private readonly families: Repository<AttributeFamilyOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<AttributeFamily[]> {
    const rows = await this.families.find({ order: { isDefault: 'DESC', code: 'ASC' } });
    return rows.map((r) => AttributeFamilyMapper.toSummary(r));
  }

  async findById(id: string): Promise<AttributeFamily | null> {
    const family = await this.families.findOne({ where: { id } });
    if (!family) return null;

    const groups = await this.dataSource.getRepository(AttributeGroupOrmEntity).find({
      where: { familyId: id },
      order: { layoutColumn: 'ASC', position: 'ASC' },
    });

    const attributeRows: JoinedFamilyAttributeRow[] = await this.dataSource.manager.query(
      `SELECT fa."id" AS fa_id, fa."group_id" AS group_id, fa."attribute_id" AS attribute_id,
              fa."position" AS position, a."code" AS code, a."admin_label" AS admin_label, a."type" AS type
         FROM "family_attributes" fa
         JOIN "attributes" a ON a."id" = fa."attribute_id"
        WHERE fa."family_id" = $1
        ORDER BY fa."position" ASC`,
      [id],
    );

    return AttributeFamilyMapper.toDomain(family, groups, attributeRows);
  }

  async existsByCode(code: string): Promise<boolean> {
    return (await this.families.count({ where: { code } })) > 0;
  }

  async resolveAttributeCodes(codes: string[]): Promise<AttributeRef[]> {
    if (codes.length === 0) return [];
    const rows = await this.dataSource
      .getRepository(AttributeOrmEntity)
      .createQueryBuilder('a')
      .select('a.id', 'id')
      .addSelect('a.code', 'code')
      .where('a.code IN (:...codes)', { codes })
      .getRawMany<AttributeRef>();
    return rows.map((r) => ({ id: r.id, code: r.code }));
  }

  async create(data: CreateAttributeFamilyData): Promise<AttributeFamily> {
    const id = await this.dataSource.transaction(async (manager) => {
      const famRepo = manager.getRepository(AttributeFamilyOrmEntity);
      const saved = await famRepo.save(
        famRepo.create({ code: data.code, name: data.name, isDefault: false }),
      );
      await this.persistGroups(manager, saved.id, data.groups);
      return saved.id;
    });

    // findById always resolves here (just inserted in the same connection).
    return (await this.findById(id)) as AttributeFamily;
  }

  async update(data: UpdateAttributeFamilyData): Promise<AttributeFamily> {
    await this.dataSource.transaction(async (manager) => {
      const famRepo = manager.getRepository(AttributeFamilyOrmEntity);
      if (data.name !== undefined) {
        await famRepo.update({ id: data.id }, { name: data.name });
      }
      // Full replace: drop the existing grouping, then rebuild from the submitted layout.
      await manager.getRepository(FamilyAttributeOrmEntity).delete({ familyId: data.id });
      await manager.getRepository(AttributeGroupOrmEntity).delete({ familyId: data.id });
      await this.persistGroups(manager, data.id, data.groups);
    });

    return (await this.findById(data.id)) as AttributeFamily;
  }

  async delete(id: string): Promise<void> {
    // attribute_groups + family_attributes cascade-delete via FK.
    await this.families.delete({ id });
  }

  async isReferencedByProduct(id: string): Promise<boolean> {
    const manager = this.dataSource.manager;
    if (!(await this.tableHasColumn(manager, 'products', 'family_id'))) return false;
    const rows = await manager.query(
      `SELECT 1 FROM "products" WHERE "family_id" = $1 LIMIT 1`,
      [id],
    );
    return rows.length > 0;
  }

  /** Persists groups (in submitted order) and their attributes (positioned by array order). */
  private async persistGroups(
    manager: EntityManager,
    familyId: string,
    groups: FamilyGroupInput[],
  ): Promise<void> {
    const groupRepo = manager.getRepository(AttributeGroupOrmEntity);
    const faRepo = manager.getRepository(FamilyAttributeOrmEntity);

    for (const g of groups) {
      const group = await groupRepo.save(
        groupRepo.create({
          familyId,
          name: g.name,
          layoutColumn: g.column,
          position: g.position,
        }),
      );
      if (g.attributeIds.length > 0) {
        await faRepo.insert(
          g.attributeIds.map((attributeId, idx) => ({
            familyId,
            groupId: group.id,
            attributeId,
            position: idx + 1,
          })),
        );
      }
    }
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
