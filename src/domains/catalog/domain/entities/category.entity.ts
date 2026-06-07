import { DisplayMode } from '../enums/display-mode.enum';
import { CategoryFilterableAttribute } from './category-filterable-attribute.entity';

/**
 * A node in the 3-level category tree that organizes the catalog (SRS 02 §5.1, §8 Category).
 * Pure domain entity — invariants live here, no ORM/Nest imports. `level` is denormalized from
 * the parent chain (top level = 1) and capped at 3 (BR-CAT-1); `slugLocked` records that the
 * category has been published at least once, freezing its slug (BR-CAT-3).
 */
export class Category {
  constructor(
    public readonly id: string,
    public parentId: string | null,
    public name: string,
    public slug: string,
    public description: string | null,
    public imageUrl: string | null,
    public logoUrl: string | null,
    public bannerUrl: string | null,
    public displayMode: DisplayMode,
    public position: number,
    public isPublished: boolean,
    public showInMenu: boolean,
    public level: number,
    public slugLocked: boolean,
    public metaTitle: string | null,
    public metaKeywords: string | null,
    public metaDescription: string | null,
    public filterableAttributes: CategoryFilterableAttribute[],
    public readonly createdAt: Date,
    public updatedAt: Date,
    public deletedAt: Date | null,
  ) {}

  /** SEO title falls back to the category name when blank (FR-CAT-010a). */
  get effectiveMetaTitle(): string {
    return this.metaTitle && this.metaTitle.trim().length > 0 ? this.metaTitle : this.name;
  }

  /** SEO description falls back to the description when blank (FR-CAT-010a). */
  get effectiveMetaDescription(): string | null {
    if (this.metaDescription && this.metaDescription.trim().length > 0) {
      return this.metaDescription;
    }
    return this.description;
  }
}
