import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { slugify } from '../../domain/category-rules';
import {
  CATEGORY_REPOSITORY,
  ICategoryRepository,
} from '../../domain/repositories/category.repository.interface';

/**
 * Shared category helpers used by the create/update use cases: unique-slug generation with a
 * numeric collision suffix (FR-CAT-002) and filterable-attribute-code resolution that rejects
 * unknown codes (FR-CAT-009). Kept in one cohesive service so both paths enforce identical rules.
 */
@Injectable()
export class CategorySupportService {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: ICategoryRepository,
  ) {}

  /**
   * Build a unique slug from `name`, appending `-2`, `-3`, … on collision; never fails for a
   * collision alone (FR-CAT-002). `excludeId` lets a rename keep its own current slug.
   */
  async generateUniqueSlug(name: string, excludeId?: string): Promise<string> {
    const base = slugify(name);
    let candidate = base;
    let suffix = 2;
    while (await this.categories.slugExists(candidate, excludeId)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  /**
   * Resolve filterable attribute codes to ordered attribute ids, rejecting any unknown code
   * with `400 UNKNOWN_ATTRIBUTE_CODES` (FR-CAT-009). Preserves the submitted order and dedupes.
   */
  async resolveFilterableAttributeIds(codes: string[]): Promise<string[]> {
    const unique = [...new Set(codes)];
    if (unique.length === 0) return [];

    const resolved = await this.categories.resolveAttributeCodes(unique);
    const byCode = new Map(resolved.map((r) => [r.code, r.id]));
    const unknown = unique.filter((c) => !byCode.has(c));
    if (unknown.length > 0) {
      throw new BadRequestException({
        code: 'UNKNOWN_ATTRIBUTE_CODES',
        message: `Unknown filterable attribute code(s): ${unknown.join(', ')}.`,
        details: { unknown_codes: unknown },
      });
    }
    return unique.map((c) => byCode.get(c) as string);
  }
}
