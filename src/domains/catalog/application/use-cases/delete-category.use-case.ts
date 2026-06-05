import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  CATEGORY_REPOSITORY,
  ICategoryRepository,
} from '../../domain/repositories/category.repository.interface';

/**
 * Soft-deletes a category (FR-CAT-006/007, §12.4). Blocked when the category still has child
 * categories or published products → `409 CATEGORY_HAS_DEPENDENTS` with actionable counts.
 */
@Injectable()
export class DeleteCategoryUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: ICategoryRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const category = await this.categories.findById(id);
    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: `Category ${id} not found.`,
      });
    }

    const [childCategories, publishedProducts] = await Promise.all([
      this.categories.countActiveChildren(id),
      this.categories.countPublishedProducts(id),
    ]);

    if (childCategories > 0 || publishedProducts > 0) {
      throw new ConflictException({
        code: 'CATEGORY_HAS_DEPENDENTS',
        message: 'This category has child categories or published products; resolve them first.',
        details: { child_categories: childCategories, published_products: publishedProducts },
      });
    }

    await this.categories.softDelete(id);
  }
}
