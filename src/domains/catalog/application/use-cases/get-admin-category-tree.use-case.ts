import { Inject, Injectable } from '@nestjs/common';

import { Category } from '../../domain/entities/category.entity';
import {
  CATEGORY_REPOSITORY,
  ICategoryRepository,
} from '../../domain/repositories/category.repository.interface';

/** A node in the admin category tree (full tree incl. drafts/unpublished; soft-deleted on opt-in). */
export interface AdminCategoryNode {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  level: number;
  position: number;
  is_published: boolean;
  show_in_menu: boolean;
  display_mode: string;
  description: string | null;
  image_url: string | null;
  logo_url: string | null;
  banner_url: string | null;
  meta_title: string | null;
  meta_keywords: string | null;
  meta_description: string | null;
  filterable_attribute_codes: string[];
  is_deleted: boolean;
  children: AdminCategoryNode[];
}

/**
 * Builds the admin category tree (contract gap — see brief/SRS §16 API-additions): the full tree
 * including drafts and unpublished nodes with `position`/`level`, serving the admin list and the
 * editor's parent picker. Soft-deleted nodes are included only when `includeDeleted` is set.
 */
@Injectable()
export class GetAdminCategoryTreeUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: ICategoryRepository,
  ) {}

  async execute(includeDeleted: boolean): Promise<AdminCategoryNode[]> {
    const categories = await this.categories.findAdminTree(includeDeleted);
    const byId = new Map<string, AdminCategoryNode>();
    for (const c of categories) {
      byId.set(c.id, GetAdminCategoryTreeUseCase.toNode(c));
    }

    const roots: AdminCategoryNode[] = [];
    for (const c of categories) {
      const node = byId.get(c.id) as AdminCategoryNode;
      const parent = c.parentId ? byId.get(c.parentId) : undefined;
      if (parent) {
        parent.children.push(node);
      } else {
        // Top-level, or a node whose parent is filtered out (e.g. deleted while this isn't).
        roots.push(node);
      }
    }
    return roots;
  }

  private static toNode(c: Category): AdminCategoryNode {
    return {
      id: c.id,
      parent_id: c.parentId,
      name: c.name,
      slug: c.slug,
      level: c.level,
      position: c.position,
      is_published: c.isPublished,
      show_in_menu: c.showInMenu,
      display_mode: c.displayMode,
      description: c.description,
      image_url: c.imageUrl,
      logo_url: c.logoUrl,
      banner_url: c.bannerUrl,
      meta_title: c.metaTitle,
      meta_keywords: c.metaKeywords,
      meta_description: c.metaDescription,
      filterable_attribute_codes: c.filterableAttributes.map((f) => f.code),
      is_deleted: c.deletedAt !== null,
      children: [],
    };
  }
}
