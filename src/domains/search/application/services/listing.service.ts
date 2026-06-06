import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DataWithMeta } from '../../../../shared/dto/data-with-meta';
import { CategoryOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/category.orm-entity';
import { ProductSearchDocumentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-search-document.orm-entity';
import { SearchScopeType, SortKey } from '../../domain/search-enums';
import { ProductCard, toProductCard } from './product-card.mapper';
import { applySortAndPaging, parseListingOptions } from './listing-query.options';

export interface CategoryListingData {
  scope: { type: SearchScopeType.CATEGORY; slug: string; title: string; breadcrumb: string[] };
  products: ProductCard[];
  applied_filters: Record<string, unknown>;
  sort: SortKey;
}

export type CategoryListingResult = DataWithMeta<CategoryListingData>;

/**
 * Category browse (FR-SRCH-001/002/004/005, BR-SRCH-1/5). Resolves a published category by slug (404
 * otherwise), then serves its published products **including descendant categories** from the index
 * (`category_ids` array membership) — no DB table scan. Sort defaults to best_selling→newest (BR-SRCH-5);
 * OOS-last + deterministic pagination via the shared helper. Facet *counts* are delegated to the facets
 * sibling — this returns `applied_filters`/`sort`/`meta` and leaves the facet hook to it.
 */
@Injectable()
export class ListingService {
  constructor(
    @InjectRepository(CategoryOrmEntity)
    private readonly categories: Repository<CategoryOrmEntity>,
    @InjectRepository(ProductSearchDocumentOrmEntity)
    private readonly documents: Repository<ProductSearchDocumentOrmEntity>,
  ) {}

  async browseCategory(
    slug: string,
    rawParams: { page?: unknown; limit?: unknown; sort?: unknown },
  ): Promise<CategoryListingResult> {
    const category = await this.categories.findOne({ where: { slug } });
    if (!category || !category.isPublished || category.deletedAt !== null) {
      throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: `Category "${slug}" not found.` });
    }

    const options = parseListingOptions(rawParams, SortKey.BEST_SELLING, false);
    const categoryIds = await this.collectCategoryAndDescendants(category.id);

    const base = (): ReturnType<Repository<ProductSearchDocumentOrmEntity>['createQueryBuilder']> =>
      this.documents
        .createQueryBuilder('doc')
        // descendant browse: the product is tagged with this category or any descendant (FR-SRCH-001).
        .where('doc.category_ids && :categoryIds', { categoryIds });

    const total = await base().getCount();

    const qb = base();
    applySortAndPaging(qb, options, false);
    const rows = await qb.getMany();

    return new DataWithMeta<CategoryListingData>(
      {
        scope: {
          type: SearchScopeType.CATEGORY,
          slug: category.slug,
          title: category.name,
          breadcrumb: await this.buildBreadcrumb(category.id),
        },
        products: rows.map(toProductCard),
        applied_filters: {},
        sort: options.sort,
      },
      { page: options.page, limit: options.limit, total },
    );
  }

  /** All descendant category ids (incl. self) via the parent_id tree (published only). */
  private async collectCategoryAndDescendants(rootId: string): Promise<string[]> {
    const all = await this.categories.find();
    const childrenByParent = new Map<string, CategoryOrmEntity[]>();
    for (const cat of all) {
      if (cat.parentId) {
        const list = childrenByParent.get(cat.parentId) ?? [];
        list.push(cat);
        childrenByParent.set(cat.parentId, list);
      }
    }
    const result: string[] = [];
    const stack = [rootId];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (seen.has(id)) continue;
      seen.add(id);
      result.push(id);
      for (const child of childrenByParent.get(id) ?? []) {
        if (child.isPublished && child.deletedAt === null) stack.push(child.id);
      }
    }
    return result;
  }

  private async buildBreadcrumb(categoryId: string): Promise<string[]> {
    const names: string[] = [];
    let currentId: string | null = categoryId;
    const guard = new Set<string>();
    while (currentId && !guard.has(currentId)) {
      guard.add(currentId);
      const cat: CategoryOrmEntity | null = await this.categories.findOne({ where: { id: currentId } });
      if (!cat) break;
      names.unshift(cat.name);
      currentId = cat.parentId;
    }
    return names;
  }
}
