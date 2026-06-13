import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { CategoryOrmEntity } from '../../infrastructure/persistence/typeorm/entities/category.orm-entity';
import { CategorySizeGuideOrmEntity } from '../../infrastructure/persistence/typeorm/entities/category-size-guide.orm-entity';

/** The PDP size-guide shape resolved onto the product detail (RW6). */
export interface ResolvedSizeGuide {
  measure_note: string;
  unit: string;
  rows: { uk: string; foot: string }[];
}

/**
 * Category-level size guides (RW6). A product's PDP `size_guide` resolves to the **nearest** ancestor
 * category that owns a chart (a child category inherits its parent's chart up the primary-category
 * chain); `null` when no category in the chain has one (e.g. non-footwear). Also backs the admin
 * set/clear endpoint. The rows are real client data — the seed ships a clearly-labelled placeholder.
 */
@Injectable()
export class SizeGuideService {
  constructor(
    @InjectRepository(CategorySizeGuideOrmEntity)
    private readonly guides: Repository<CategorySizeGuideOrmEntity>,
    @InjectRepository(CategoryOrmEntity)
    private readonly categories: Repository<CategoryOrmEntity>,
  ) {}

  /**
   * Resolve the size guide for a product by walking its primary-category ancestry (leaf → root) and
   * returning the first category that has a chart. `null` when none in the chain does.
   */
  async resolveForCategory(primaryCategoryId: string | null): Promise<ResolvedSizeGuide | null> {
    if (!primaryCategoryId) return null;

    // Walk the ancestry into a list (nearest-first), cycle-guarded.
    const chain: string[] = [];
    const seen = new Set<string>();
    let currentId: string | null = primaryCategoryId;
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      chain.push(currentId);
      const cat: CategoryOrmEntity | null = await this.categories.findOne({
        where: { id: currentId },
        select: { id: true, parentId: true },
      });
      currentId = cat?.parentId ?? null;
    }
    if (chain.length === 0) return null;

    const rows = await this.guides.find({ where: { categoryId: In(chain) } });
    if (rows.length === 0) return null;
    const byId = new Map(rows.map((r) => [r.categoryId, r]));
    // Nearest wins: first category in the leaf→root chain that has a guide.
    for (const id of chain) {
      const guide = byId.get(id);
      if (guide) return this.toResolved(guide);
    }
    return null;
  }

  /** Admin: set (upsert) the chart on a category. */
  async set(categoryId: string, input: ResolvedSizeGuide): Promise<number> {
    await this.assertCategoryExists(categoryId);
    const entity = this.guides.create({
      categoryId,
      measureNote: input.measure_note,
      unit: input.unit,
      rows: input.rows,
    });
    await this.guides.save(entity);
    return input.rows.length;
  }

  /** Admin: clear the chart on a category (idempotent). */
  async clear(categoryId: string): Promise<void> {
    await this.assertCategoryExists(categoryId);
    await this.guides.delete({ categoryId });
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const exists = await this.categories.findOne({ where: { id: categoryId }, select: { id: true } });
    if (!exists) {
      throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: `Category ${categoryId} not found.` });
    }
  }

  private toResolved(g: CategorySizeGuideOrmEntity): ResolvedSizeGuide {
    return {
      measure_note: g.measureNote,
      unit: g.unit,
      rows: Array.isArray(g.rows) ? g.rows : [],
    };
  }
}
