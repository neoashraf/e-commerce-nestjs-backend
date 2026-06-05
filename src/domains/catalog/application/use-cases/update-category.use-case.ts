import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { Category } from '../../domain/entities/category.entity';
import { DisplayMode } from '../../domain/enums/display-mode.enum';
import { fitsDepth, levelForParent } from '../../domain/category-rules';
import {
  CATEGORY_REPOSITORY,
  ICategoryRepository,
  UpdateCategoryData,
} from '../../domain/repositories/category.repository.interface';
import { CategorySupportService } from '../services/category-support.service';

/** Fields explicitly provided are updated; `undefined` leaves them untouched. */
export interface UpdateCategoryCommand {
  id: string;
  name?: string;
  parentId?: string | null;
  description?: string | null;
  displayMode?: DisplayMode;
  position?: number;
  isPublished?: boolean;
  showInMenu?: boolean;
  imageUrl?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  filterableAttributeCodes?: string[];
  metaTitle?: string | null;
  metaKeywords?: string | null;
  metaDescription?: string | null;
}

/**
 * Updates a category (FR-CAT-004/005/008/010a, BR-CAT-1/3). Reorders siblings, toggles publish
 * and show-in-menu independently, replaces the filterable set, and edits display/SEO fields.
 * Re-parenting recomputes `level` and rejects a subtree that would exceed depth 3 (`400`) or a
 * cycle (`400`); a missing parent is `404`. The slug regenerates on rename only until the
 * category is first published, after which it is frozen (BR-CAT-3).
 */
@Injectable()
export class UpdateCategoryUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: ICategoryRepository,
    private readonly support: CategorySupportService,
  ) {}

  async execute(cmd: UpdateCategoryCommand): Promise<Category> {
    const category = await this.categories.findById(cmd.id);
    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: `Category ${cmd.id} not found.`,
      });
    }

    const data: UpdateCategoryData = { id: cmd.id };

    if (cmd.name !== undefined) {
      data.name = cmd.name;
      // Slug tracks the name only while unlocked (BR-CAT-3); once published it is immutable.
      if (!category.slugLocked) {
        data.slug = await this.support.generateUniqueSlug(cmd.name, cmd.id);
      }
    }
    if (cmd.description !== undefined) data.description = cmd.description;
    if (cmd.displayMode !== undefined) data.displayMode = cmd.displayMode;
    if (cmd.position !== undefined) data.position = cmd.position;
    if (cmd.showInMenu !== undefined) data.showInMenu = cmd.showInMenu;
    if (cmd.imageUrl !== undefined) data.imageUrl = cmd.imageUrl;
    if (cmd.logoUrl !== undefined) data.logoUrl = cmd.logoUrl;
    if (cmd.bannerUrl !== undefined) data.bannerUrl = cmd.bannerUrl;
    if (cmd.metaTitle !== undefined) data.metaTitle = cmd.metaTitle;
    if (cmd.metaKeywords !== undefined) data.metaKeywords = cmd.metaKeywords;
    if (cmd.metaDescription !== undefined) data.metaDescription = cmd.metaDescription;

    if (cmd.isPublished !== undefined) {
      data.isPublished = cmd.isPublished;
      // First publish freezes the slug; the lock is sticky thereafter (BR-CAT-3).
      if (cmd.isPublished) data.lockSlug = true;
    }

    if (cmd.parentId !== undefined && cmd.parentId !== category.parentId) {
      await this.applyReparent(category, cmd.parentId, data);
    }

    if (cmd.filterableAttributeCodes !== undefined) {
      data.filterableAttributeIds = await this.support.resolveFilterableAttributeIds(
        cmd.filterableAttributeCodes,
      );
    }

    return this.categories.update(data);
  }

  /** Validate a re-parent (existence, cycle, depth) and stamp the resolved level onto `data`. */
  private async applyReparent(
    category: Category,
    newParentId: string | null,
    data: UpdateCategoryData,
  ): Promise<void> {
    let parentLevel: number | null = null;
    if (newParentId !== null) {
      const parent = await this.categories.findById(newParentId);
      if (!parent) {
        throw new NotFoundException({
          code: 'PARENT_NOT_FOUND',
          message: `Parent category ${newParentId} not found.`,
        });
      }
      if (await this.categories.isSelfOrDescendant(category.id, newParentId)) {
        throw new BadRequestException({
          code: 'INVALID_PARENT',
          message: 'A category cannot be moved under itself or one of its descendants.',
        });
      }
      parentLevel = parent.level;
    }

    const newLevel = levelForParent(parentLevel);
    const subtreeMax = await this.categories.subtreeMaxLevel(category.id);
    const relativeDepth = subtreeMax - category.level;
    if (!fitsDepth(newLevel, relativeDepth)) {
      throw new BadRequestException({
        code: 'MAX_DEPTH_EXCEEDED',
        message: 'Moving this category here would exceed the 3-level depth cap.',
      });
    }

    data.parentId = newParentId;
    data.newLevel = newLevel;
  }
}
