import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { CategoryOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/category.orm-entity';
import { MenuItemOrmEntity } from '../../infrastructure/persistence/typeorm/entities/menu-item.orm-entity';
import { PageOrmEntity } from '../../infrastructure/persistence/typeorm/entities/page.orm-entity';

export type MenuName = 'header' | 'footer';
export type LinkType = 'category' | 'page' | 'url';

export interface MenuItemInput {
  label: string;
  link_type: LinkType;
  link_ref: string;
  display_order?: number;
  is_published?: boolean;
  children?: MenuItemInput[];
}

export interface MenuItemNode {
  id: string;
  label: string;
  link_type: string;
  link_ref: string;
  display_order: number;
  is_published: boolean;
  children: MenuItemNode[];
}

/** A storefront menu node (no admin-only fields; published + resolved targets only). */
export interface PublicMenuNode {
  label: string;
  link_type: string;
  link_ref: string;
  children: PublicMenuNode[];
}

const VALID_MENUS: MenuName[] = ['header', 'footer'];
const VALID_LINK_TYPES: LinkType[] = ['category', 'page', 'url'];

/**
 * CMS menus (FR-CMS-030/031): header/footer trees (one level of nesting) with GET + whole-tree PUT, and
 * the published-menu read the homepage payload consumes (omitting items whose targets are
 * unpublished/soft-deleted/unresolved, BR-CMS-3). Also exposes `isPageLinked` for cms-pages-be's
 * PAGE_LINKED delete guard. PUT replaces the entire menu atomically.
 */
@Injectable()
export class MenusService {
  constructor(
    @InjectRepository(MenuItemOrmEntity)
    private readonly items: Repository<MenuItemOrmEntity>,
    @InjectRepository(CategoryOrmEntity)
    private readonly categories: Repository<CategoryOrmEntity>,
    @InjectRepository(PageOrmEntity)
    private readonly pages: Repository<PageOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // --- Admin ---

  /** Full ordered tree for a menu (admin view; includes unpublished items). */
  async getTree(menu: string): Promise<MenuItemNode[]> {
    const menuName = this.assertMenu(menu);
    const rows = await this.items.find({ where: { menu: menuName }, order: { displayOrder: 'ASC' } });
    return this.buildTree(rows);
  }

  /** Replace the whole ordered tree for a menu (FR-CMS-030). Validates labels + targets. */
  async replaceTree(menu: string, items: MenuItemInput[]): Promise<void> {
    const menuName = this.assertMenu(menu);
    this.validateItems(items);

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(MenuItemOrmEntity);
      await repo.delete({ menu: menuName });
      let order = 0;
      for (const item of items) {
        const parent = await repo.save(
          repo.create({
            menu: menuName,
            parentId: null,
            label: item.label,
            linkType: item.link_type,
            linkRef: item.link_ref,
            displayOrder: item.display_order ?? order++,
            isPublished: item.is_published ?? true,
          }),
        );
        let childOrder = 0;
        for (const child of item.children ?? []) {
          await repo.save(
            repo.create({
              menu: menuName,
              parentId: parent.id,
              label: child.label,
              linkType: child.link_type,
              linkRef: child.link_ref,
              displayOrder: child.display_order ?? childOrder++,
              isPublished: child.is_published ?? true,
            }),
          );
        }
      }
    });
  }

  // --- Storefront consumption (homepage payload) ---

  /** Published menu with unresolved/unpublished targets omitted (FR-CMS-031, BR-CMS-3, §12.2). */
  async getPublishedMenu(menu: string): Promise<PublicMenuNode[]> {
    const menuName = this.assertMenu(menu);
    const rows = await this.items.find({
      where: { menu: menuName, isPublished: true },
      order: { displayOrder: 'ASC' },
    });

    const resolvable = new Map<string, boolean>();
    const canShow = async (item: MenuItemOrmEntity): Promise<boolean> => {
      const cacheKey = `${item.linkType}:${item.linkRef}`;
      if (resolvable.has(cacheKey)) return resolvable.get(cacheKey) as boolean;
      const ok = await this.targetResolves(item.linkType, item.linkRef);
      resolvable.set(cacheKey, ok);
      return ok;
    };

    const tops = rows.filter((r) => r.parentId === null);
    const result: PublicMenuNode[] = [];
    for (const top of tops) {
      if (!(await canShow(top))) continue;
      const children: PublicMenuNode[] = [];
      for (const child of rows.filter((r) => r.parentId === top.id)) {
        if (await canShow(child)) {
          children.push({ label: child.label, link_type: child.linkType, link_ref: child.linkRef, children: [] });
        }
      }
      result.push({ label: top.label, link_type: top.linkType, link_ref: top.linkRef, children });
    }
    return result;
  }

  /** Whether a page slug is linked by ANY published menu item (cms-pages-be PAGE_LINKED guard). */
  async isPageLinked(slug: string): Promise<boolean> {
    const count = await this.items.count({
      where: { linkType: 'page', linkRef: slug, isPublished: true },
    });
    return count > 0;
  }

  // --- helpers ---

  private buildTree(rows: MenuItemOrmEntity[]): MenuItemNode[] {
    const tops = rows.filter((r) => r.parentId === null);
    return tops.map((top) => ({
      id: top.id,
      label: top.label,
      link_type: top.linkType,
      link_ref: top.linkRef,
      display_order: top.displayOrder,
      is_published: top.isPublished,
      children: rows
        .filter((r) => r.parentId === top.id)
        .map((c) => ({
          id: c.id,
          label: c.label,
          link_type: c.linkType,
          link_ref: c.linkRef,
          display_order: c.displayOrder,
          is_published: c.isPublished,
          children: [],
        })),
    }));
  }

  private async targetResolves(linkType: string, linkRef: string): Promise<boolean> {
    if (linkType === 'url') return linkRef.trim() !== '';
    if (linkType === 'category') {
      const cat = await this.categories.findOne({ where: { slug: linkRef } });
      return !!cat && cat.isPublished && cat.deletedAt === null;
    }
    if (linkType === 'page') {
      const page = await this.pages.findOne({ where: { slug: linkRef, isPublished: true } });
      return !!page;
    }
    return false;
  }

  private assertMenu(menu: string): MenuName {
    if (!VALID_MENUS.includes(menu as MenuName)) {
      throw new BadRequestException({ code: 'INVALID_MENU', message: 'menu must be header or footer.' });
    }
    return menu as MenuName;
  }

  private validateItems(items: MenuItemInput[], depth = 0): void {
    for (const item of items) {
      if (!item.label || item.label.trim() === '') {
        throw new BadRequestException({ code: 'INVALID_MENU_ITEM', message: 'Each menu item needs a label.' });
      }
      if (!VALID_LINK_TYPES.includes(item.link_type)) {
        throw new BadRequestException({
          code: 'INVALID_LINK_TYPE',
          message: `link_type must be one of ${VALID_LINK_TYPES.join(', ')}.`,
        });
      }
      if (!item.link_ref || item.link_ref.trim() === '') {
        throw new BadRequestException({ code: 'INVALID_LINK_REF', message: 'link_ref is required.' });
      }
      if (item.children && item.children.length > 0) {
        if (depth >= 1) {
          throw new BadRequestException({
            code: 'NESTING_TOO_DEEP',
            message: 'Menus support only one level of nesting.',
          });
        }
        this.validateItems(item.children, depth + 1);
      }
    }
  }
}
