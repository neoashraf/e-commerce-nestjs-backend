import { Inject, Injectable } from '@nestjs/common';

import {
  CATEGORY_REPOSITORY,
  ICategoryRepository,
} from '../../domain/repositories/category.repository.interface';

/** A node in the public, published+in-menu category tree (FR-CAT-040). */
export interface PublicCategoryNode {
  id: string;
  name: string;
  slug: string;
  /** Tile/thumbnail image for storefront category tiles (RW6); null → colour-tint placeholder. */
  image_url: string | null;
  children: PublicCategoryNode[];
}

/**
 * Builds the storefront category tree: only `is_published && show_in_menu` nodes, nested by
 * parent (FR-CAT-040). A node whose parent is excluded (unpublished/hidden/soft-deleted) is
 * dropped along with its subtree, since its ancestor chain is broken.
 */
@Injectable()
export class GetPublicCategoryTreeUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: ICategoryRepository,
  ) {}

  async execute(): Promise<PublicCategoryNode[]> {
    const nodes = await this.categories.findPublishedMenuNodes();
    const byId = new Map<string, PublicCategoryNode>();
    for (const c of nodes) {
      byId.set(c.id, {
        id: c.id,
        name: c.name,
        slug: c.slug,
        image_url: c.imageUrl ?? null,
        children: [],
      });
    }

    const roots: PublicCategoryNode[] = [];
    // `nodes` is ordered by position; preserve it as we attach children.
    for (const c of nodes) {
      const node = byId.get(c.id) as PublicCategoryNode;
      if (c.parentId === null) {
        roots.push(node);
      } else {
        const parent = byId.get(c.parentId);
        if (parent) parent.children.push(node);
        // else: parent is excluded → drop this node + its subtree.
      }
    }
    return roots;
  }
}
