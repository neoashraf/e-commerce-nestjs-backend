import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { Category } from '../../domain/entities/category.entity';
import { DisplayMode } from '../../domain/enums/display-mode.enum';
import { levelForParent, MAX_CATEGORY_DEPTH } from '../../domain/category-rules';
import {
  CATEGORY_REPOSITORY,
  ICategoryRepository,
} from '../../domain/repositories/category.repository.interface';
import { CategorySupportService } from '../services/category-support.service';

export interface CreateCategoryCommand {
  name: string;
  parentId: string | null;
  description: string | null;
  displayMode: DisplayMode;
  showInMenu: boolean;
  imageUrl: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  filterableAttributeCodes: string[];
  metaTitle: string | null;
  metaKeywords: string | null;
  metaDescription: string | null;
}

/**
 * Creates a category (FR-CAT-001/002/003/009/010a). Computes `level` from the parent and rejects
 * a tree deeper than 3 (`400`), a missing parent (`404`), or an unknown filterable code (`400`).
 * Generates a unique slug; the category starts unpublished (FR-CAT-014 analog).
 */
@Injectable()
export class CreateCategoryUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: ICategoryRepository,
    private readonly support: CategorySupportService,
  ) {}

  async execute(cmd: CreateCategoryCommand): Promise<Category> {
    let level = 1;
    if (cmd.parentId !== null) {
      const parent = await this.categories.findById(cmd.parentId);
      if (!parent) {
        throw new NotFoundException({
          code: 'PARENT_NOT_FOUND',
          message: `Parent category ${cmd.parentId} not found.`,
        });
      }
      level = levelForParent(parent.level);
      if (level > MAX_CATEGORY_DEPTH) {
        throw new BadRequestException({
          code: 'MAX_DEPTH_EXCEEDED',
          message: `Category tree depth is capped at ${MAX_CATEGORY_DEPTH} levels.`,
        });
      }
    }

    const filterableAttributeIds = await this.support.resolveFilterableAttributeIds(
      cmd.filterableAttributeCodes,
    );
    const slug = await this.support.generateUniqueSlug(cmd.name);

    return this.categories.create({
      parentId: cmd.parentId,
      name: cmd.name,
      slug,
      description: cmd.description,
      imageUrl: cmd.imageUrl,
      logoUrl: cmd.logoUrl,
      bannerUrl: cmd.bannerUrl,
      displayMode: cmd.displayMode,
      showInMenu: cmd.showInMenu,
      level,
      metaTitle: cmd.metaTitle,
      metaKeywords: cmd.metaKeywords,
      metaDescription: cmd.metaDescription,
      filterableAttributeIds,
    });
  }
}
