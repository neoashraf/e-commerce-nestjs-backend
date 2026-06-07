import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';

import { Category } from '../../../../domain/entities/category.entity';
import {
  AttributeRef,
  CreateCategoryData,
  ICategoryRepository,
  UpdateCategoryData,
} from '../../../../domain/repositories/category.repository.interface';
import { AttributeOrmEntity } from '../entities/attribute.orm-entity';
import { CategoryFilterableAttributeOrmEntity } from '../entities/category-filterable-attribute.orm-entity';
import { CategoryOrmEntity } from '../entities/category.orm-entity';
import { CategoryMapper, JoinedFilterableAttributeRow } from '../mappers/category.mapper';

/**
 * TypeORM-backed category repository. Tree mutations (create position, re-parent level shift)
 * run inside transactions; the published-product dependents check (FR-CAT-006) probes the
 * as-yet-unbuilt `products` table via `information_schema`, so it degrades to "no products"
 * until that table lands and lights up automatically once it exists.
 */
@Injectable()
export class TypeOrmCategoryRepository implements ICategoryRepository {
  constructor(
    @InjectRepository(CategoryOrmEntity)
    private readonly categories: Repository<CategoryOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findById(id: string): Promise<Category | null> {
    const row = await this.categories.findOne({ where: { id } });
    if (!row) return null;
    const filterable = await this.loadFilterable([id]);
    return CategoryMapper.toDomain(row, filterable.get(id) ?? []);
  }

  async create(data: CreateCategoryData): Promise<Category> {
    const id = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CategoryOrmEntity);
      const position = await this.nextSiblingPosition(manager, data.parentId);
      const saved = await repo.save(
        repo.create({
          parentId: data.parentId,
          name: data.name,
          slug: data.slug,
          description: data.description,
          imageUrl: data.imageUrl,
          logoUrl: data.logoUrl,
          bannerUrl: data.bannerUrl,
          displayMode: data.displayMode,
          showInMenu: data.showInMenu,
          isPublished: false,
          level: data.level,
          slugLocked: false,
          position,
          metaTitle: data.metaTitle,
          metaKeywords: data.metaKeywords,
          metaDescription: data.metaDescription,
        }),
      );
      await this.replaceFilterable(manager, saved.id, data.filterableAttributeIds);
      return saved.id;
    });

    return (await this.findById(id)) as Category;
  }

  async update(data: UpdateCategoryData): Promise<Category> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CategoryOrmEntity);

      const patch: Partial<CategoryOrmEntity> = {};
      if (data.name !== undefined) patch.name = data.name;
      if (data.slug !== undefined) patch.slug = data.slug;
      if (data.description !== undefined) patch.description = data.description;
      if (data.imageUrl !== undefined) patch.imageUrl = data.imageUrl;
      if (data.logoUrl !== undefined) patch.logoUrl = data.logoUrl;
      if (data.bannerUrl !== undefined) patch.bannerUrl = data.bannerUrl;
      if (data.displayMode !== undefined) patch.displayMode = data.displayMode;
      if (data.position !== undefined) patch.position = data.position;
      if (data.isPublished !== undefined) patch.isPublished = data.isPublished;
      if (data.showInMenu !== undefined) patch.showInMenu = data.showInMenu;
      if (data.metaTitle !== undefined) patch.metaTitle = data.metaTitle;
      if (data.metaKeywords !== undefined) patch.metaKeywords = data.metaKeywords;
      if (data.metaDescription !== undefined) patch.metaDescription = data.metaDescription;
      if (data.lockSlug) patch.slugLocked = true;
      if (data.parentId !== undefined) patch.parentId = data.parentId;

      if (Object.keys(patch).length > 0) {
        await repo.update({ id: data.id }, patch);
      }

      // Re-parent: shift this node + its whole subtree by the level delta (FR-CAT-003).
      if (data.newLevel !== undefined) {
        const current = await repo.findOne({ where: { id: data.id } });
        const delta = data.newLevel - (current?.level ?? data.newLevel);
        if (delta !== 0) {
          await manager.query(
            `WITH RECURSIVE subtree AS (
               SELECT "id" FROM "categories" WHERE "id" = $1 AND "deleted_at" IS NULL
               UNION ALL
               SELECT c."id" FROM "categories" c
                 JOIN subtree s ON c."parent_id" = s."id"
                WHERE c."deleted_at" IS NULL
             )
             UPDATE "categories" SET "level" = "level" + $2 WHERE "id" IN (SELECT "id" FROM subtree)`,
            [data.id, delta],
          );
        }
      }

      if (data.filterableAttributeIds !== undefined) {
        await this.replaceFilterable(manager, data.id, data.filterableAttributeIds);
      }
    });

    return (await this.findById(data.id)) as Category;
  }

  async softDelete(id: string): Promise<void> {
    await this.categories.softDelete(id);
  }

  async slugExists(slug: string, excludeId?: string): Promise<boolean> {
    // Probe ALL rows (incl. soft-deleted): the unique index spans them, so slug generation
    // must avoid collisions against retained rows too (FR-CAT-002, BR-CAT-8).
    const qb = this.categories
      .createQueryBuilder('c')
      .withDeleted()
      .where('c.slug = :slug', { slug });
    if (excludeId) qb.andWhere('c.id != :excludeId', { excludeId });
    return (await qb.getCount()) > 0;
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

  async countActiveChildren(id: string): Promise<number> {
    return this.categories.count({ where: { parentId: id, deletedAt: IsNull() } });
  }

  async countPublishedProducts(id: string): Promise<number> {
    const manager = this.dataSource.manager;
    if (!(await this.tableHasColumn(manager, 'products', 'primary_category_id'))) return 0;
    const rows = await manager.query(
      `SELECT count(*)::int AS count FROM "products"
        WHERE "primary_category_id" = $1 AND "status" = 'published' AND "deleted_at" IS NULL`,
      [id],
    );
    return rows[0]?.count ?? 0;
  }

  async subtreeMaxLevel(id: string): Promise<number> {
    const rows = await this.dataSource.manager.query(
      `WITH RECURSIVE subtree AS (
         SELECT "id", "level" FROM "categories" WHERE "id" = $1 AND "deleted_at" IS NULL
         UNION ALL
         SELECT c."id", c."level" FROM "categories" c
           JOIN subtree s ON c."parent_id" = s."id"
          WHERE c."deleted_at" IS NULL
       )
       SELECT COALESCE(MAX("level"), 0)::int AS max FROM subtree`,
      [id],
    );
    return rows[0]?.max ?? 0;
  }

  async isSelfOrDescendant(id: string, candidateId: string): Promise<boolean> {
    const rows = await this.dataSource.manager.query(
      `WITH RECURSIVE subtree AS (
         SELECT "id" FROM "categories" WHERE "id" = $1 AND "deleted_at" IS NULL
         UNION ALL
         SELECT c."id" FROM "categories" c
           JOIN subtree s ON c."parent_id" = s."id"
          WHERE c."deleted_at" IS NULL
       )
       SELECT 1 FROM subtree WHERE "id" = $2 LIMIT 1`,
      [id, candidateId],
    );
    return rows.length > 0;
  }

  async findAdminTree(includeDeleted: boolean): Promise<Category[]> {
    const qb = this.categories
      .createQueryBuilder('c')
      .orderBy('c.level', 'ASC')
      .addOrderBy('c.position', 'ASC');
    if (includeDeleted) qb.withDeleted();
    const rows = await qb.getMany();
    const filterable = await this.loadFilterable(rows.map((r) => r.id));
    return rows.map((r) => CategoryMapper.toDomain(r, filterable.get(r.id) ?? []));
  }

  async findPublishedMenuNodes(): Promise<Category[]> {
    const rows = await this.categories.find({
      where: { isPublished: true, showInMenu: true, deletedAt: IsNull() },
      order: { position: 'ASC' },
    });
    // Public tree needs only id/name/slug/parent — skip the filterable join.
    return rows.map((r) => CategoryMapper.toDomain(r, []));
  }

  /** Next sort position among non-deleted siblings sharing `parentId` (append to the end). */
  private async nextSiblingPosition(
    manager: EntityManager,
    parentId: string | null,
  ): Promise<number> {
    const rows = await manager.query(
      `SELECT COALESCE(MAX("position"), -1)::int AS max FROM "categories"
        WHERE "deleted_at" IS NULL AND ${parentId === null ? '"parent_id" IS NULL' : '"parent_id" = $1'}`,
      parentId === null ? [] : [parentId],
    );
    return (rows[0]?.max ?? -1) + 1;
  }

  /** Replace a category's filterable links with the given ordered attribute ids (FR-CAT-009). */
  private async replaceFilterable(
    manager: EntityManager,
    categoryId: string,
    attributeIds: string[],
  ): Promise<void> {
    const linkRepo = manager.getRepository(CategoryFilterableAttributeOrmEntity);
    await linkRepo.delete({ categoryId });
    if (attributeIds.length > 0) {
      await linkRepo.insert(
        attributeIds.map((attributeId, idx) => ({
          categoryId,
          attributeId,
          position: idx + 1,
        })),
      );
    }
  }

  /** Load filterable links (with the attribute `code`) for a set of categories, grouped by id. */
  private async loadFilterable(
    categoryIds: string[],
  ): Promise<Map<string, JoinedFilterableAttributeRow[]>> {
    const grouped = new Map<string, JoinedFilterableAttributeRow[]>();
    if (categoryIds.length === 0) return grouped;

    const rows = await this.dataSource
      .getRepository(CategoryFilterableAttributeOrmEntity)
      .createQueryBuilder('cfa')
      .innerJoin(AttributeOrmEntity, 'a', 'a.id = cfa.attribute_id')
      .select('cfa.category_id', 'category_id')
      .addSelect('cfa.attribute_id', 'attribute_id')
      .addSelect('a.code', 'code')
      .addSelect('cfa.position', 'position')
      .where('cfa.category_id IN (:...categoryIds)', { categoryIds })
      .orderBy('cfa.position', 'ASC')
      .getRawMany<{ category_id: string; attribute_id: string; code: string; position: number }>();

    for (const r of rows) {
      const list = grouped.get(r.category_id) ?? [];
      list.push({ attribute_id: r.attribute_id, code: r.code, position: r.position });
      grouped.set(r.category_id, list);
    }
    return grouped;
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
