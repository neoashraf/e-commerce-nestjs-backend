import { Category } from '../entities/category.entity';
import { DisplayMode } from '../enums/display-mode.enum';

/** An attribute resolved from a code (for the filterable set). */
export interface AttributeRef {
  id: string;
  code: string;
}

/** New-category persistence payload (slug + level already resolved by the use case). */
export interface CreateCategoryData {
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  displayMode: DisplayMode;
  showInMenu: boolean;
  level: number;
  metaTitle: string | null;
  metaKeywords: string | null;
  metaDescription: string | null;
  /** Resolved attribute ids, in submitted order (FR-CAT-009). */
  filterableAttributeIds: string[];
}

/**
 * Update payload. Scalar fields apply only when provided. `slug` is set only when the use case
 * regenerated it (rename before the slug is locked). `newLevel` is present only on a re-parent
 * and carries the resolved level for this node; the repository shifts the whole subtree by the
 * delta. `lockSlug` freezes the slug on first publish. `filterableAttributeIds === undefined`
 * leaves the facet set untouched; otherwise it is fully replaced.
 */
export interface UpdateCategoryData {
  id: string;
  name?: string;
  slug?: string;
  description?: string | null;
  imageUrl?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  displayMode?: DisplayMode;
  position?: number;
  isPublished?: boolean;
  showInMenu?: boolean;
  metaTitle?: string | null;
  metaKeywords?: string | null;
  metaDescription?: string | null;
  parentId?: string | null;
  newLevel?: number;
  lockSlug?: boolean;
  filterableAttributeIds?: string[];
}

export interface ICategoryRepository {
  /** Single category with its ordered filterable-attribute refs (excludes soft-deleted). */
  findById(id: string): Promise<Category | null>;
  create(data: CreateCategoryData): Promise<Category>;
  update(data: UpdateCategoryData): Promise<Category>;
  /** Soft-delete (set `deleted_at`); cascades the filterable links (FR-CAT-007). */
  softDelete(id: string): Promise<void>;
  /** Slug uniqueness among non-deleted categories, optionally excluding one id (FR-CAT-002). */
  slugExists(slug: string, excludeId?: string): Promise<boolean>;
  /** Resolve attribute codes to ids; the result omits any unknown code (use case detects gaps). */
  resolveAttributeCodes(codes: string[]): Promise<AttributeRef[]>;
  /** Count of non-deleted direct children (FR-CAT-006). */
  countActiveChildren(id: string): Promise<number>;
  /** Count of published products assigned to the category; 0 until `products` lands (FR-CAT-006). */
  countPublishedProducts(id: string): Promise<number>;
  /** Highest `level` across the node and its non-deleted descendants (re-parent depth guard). */
  subtreeMaxLevel(id: string): Promise<number>;
  /** Whether `candidateId` is the node itself or one of its descendants (cycle guard). */
  isSelfOrDescendant(id: string, candidateId: string): Promise<boolean>;
  /** Full admin tree (drafts + unpublished), soft-deleted included only on opt-in. */
  findAdminTree(includeDeleted: boolean): Promise<Category[]>;
  /** Flat set of published, in-menu, non-deleted nodes for the public tree (FR-CAT-040). */
  findPublishedMenuNodes(): Promise<Category[]>;
}

export const CATEGORY_REPOSITORY = Symbol('ICategoryRepository');
