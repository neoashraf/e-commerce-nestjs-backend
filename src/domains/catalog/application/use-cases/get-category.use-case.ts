import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { Category } from '../../domain/entities/category.entity';
import {
  CATEGORY_REPOSITORY,
  ICategoryRepository,
} from '../../domain/repositories/category.repository.interface';

/** Fetch one category with its filterable-attribute refs for the admin editor prefill (FR-CAT-002). */
@Injectable()
export class GetCategoryUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY) private readonly categories: ICategoryRepository,
  ) {}

  async execute(id: string): Promise<Category> {
    const category = await this.categories.findById(id);
    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: `Category ${id} not found.`,
      });
    }
    return category;
  }
}
