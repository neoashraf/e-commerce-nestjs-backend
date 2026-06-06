import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { isValidSlug } from '../../domain/slug';
import { PageOrmEntity } from '../../infrastructure/persistence/typeorm/entities/page.orm-entity';

export interface CreatePageCommand {
  slug: string;
  title: string;
  body: string;
  seo_title?: string | null;
  seo_description?: string | null;
  is_published?: boolean;
}

export interface UpdatePageCommand {
  slug?: string;
  title?: string;
  body?: string;
  seo_title?: string | null;
  seo_description?: string | null;
  is_published?: boolean;
  /** Confirms a slug change on a linked page (FR-CMS-044). */
  confirm_slug_change?: boolean;
}

export interface PageListRow {
  id: string;
  slug: string;
  title: string;
  is_published: boolean;
  is_system: boolean;
  updated_at: Date;
}

export interface PublicPage {
  slug: string;
  title: string;
  body: string;
  seo: { title: string | null; description: string | null };
  updated_at: Date;
}

/**
 * CMS pages (FR-CMS-040–044, 061): admin CRUD with unique/stable slugs + SEO + draft/publish, the
 * delete guard (`PAGE_LINKED` for system or menu-linked pages, FR-CMS-043), the linked-slug-change
 * warning (FR-CMS-044), and the public published-only page-by-slug read (FR-CMS-061). The menu-link
 * check degrades gracefully until cms-menus-be ships its table. A `PageRedirect` table is deferred
 * (Open Q) — a slug change is gated behind explicit confirmation for now.
 */
@Injectable()
export class PagesService {
  constructor(
    @InjectRepository(PageOrmEntity)
    private readonly pages: Repository<PageOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // --- Admin ---

  async list(): Promise<PageListRow[]> {
    const rows = await this.pages.find({ order: { updatedAt: 'DESC' } });
    return rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      is_published: p.isPublished,
      is_system: p.isSystem,
      updated_at: p.updatedAt,
    }));
  }

  async getById(id: string): Promise<PageOrmEntity> {
    const page = await this.pages.findOne({ where: { id } });
    if (!page) throw this.notFound(id);
    return page;
  }

  async create(cmd: CreatePageCommand): Promise<PageOrmEntity> {
    this.assertSlug(cmd.slug);
    this.assertBody(cmd.body);
    await this.assertSlugFree(cmd.slug, null);
    return this.pages.save(
      this.pages.create({
        slug: cmd.slug,
        title: cmd.title,
        body: cmd.body,
        seoTitle: cmd.seo_title ?? null,
        seoDescription: cmd.seo_description ?? null,
        isPublished: cmd.is_published ?? false, // draft by default (FR-CMS-040)
        isSystem: false,
      }),
    );
  }

  async update(id: string, cmd: UpdatePageCommand): Promise<PageOrmEntity> {
    const page = await this.getById(id);

    if (cmd.slug !== undefined && cmd.slug !== page.slug) {
      this.assertSlug(cmd.slug);
      await this.assertSlugFree(cmd.slug, id);
      // FR-CMS-044: changing a slug that is linked (system page or menu-linked) needs confirmation.
      if ((page.isSystem || (await this.isMenuLinked(page.slug))) && !cmd.confirm_slug_change) {
        throw new BadRequestException({
          code: 'SLUG_CHANGE_REQUIRES_CONFIRMATION',
          message: 'This page is linked elsewhere; confirm the slug change (a redirect should be set).',
        });
      }
      page.slug = cmd.slug;
    }
    if (cmd.title !== undefined) page.title = cmd.title;
    if (cmd.body !== undefined) {
      this.assertBody(cmd.body);
      page.body = cmd.body;
    }
    if (cmd.seo_title !== undefined) page.seoTitle = cmd.seo_title;
    if (cmd.seo_description !== undefined) page.seoDescription = cmd.seo_description;
    if (cmd.is_published !== undefined) page.isPublished = cmd.is_published;
    return this.pages.save(page);
  }

  async remove(id: string): Promise<void> {
    const page = await this.getById(id);
    // FR-CMS-043: system policy pages and menu-linked pages cannot be deleted.
    if (page.isSystem || (await this.isMenuLinked(page.slug))) {
      throw new ConflictException({
        code: 'PAGE_LINKED',
        message: 'Page is a system policy page or linked in a menu.',
      });
    }
    await this.pages.softDelete({ id });
  }

  // --- Storefront ---

  async getPublishedBySlug(slug: string): Promise<PublicPage> {
    const page = await this.pages.findOne({ where: { slug, isPublished: true } });
    if (!page) {
      throw new NotFoundException({ code: 'PAGE_NOT_FOUND', message: `Page "${slug}" not found.` });
    }
    return {
      slug: page.slug,
      title: page.title,
      body: page.body,
      seo: { title: page.seoTitle, description: page.seoDescription },
      updated_at: page.updatedAt,
    };
  }

  // --- helpers ---

  private assertSlug(slug: string): void {
    if (!isValidSlug(slug)) {
      throw new BadRequestException({
        code: 'INVALID_SLUG',
        message: 'slug must be lowercase letters, digits and hyphens (a-z0-9-).',
      });
    }
  }

  private assertBody(body: string): void {
    if (!body || body.trim() === '') {
      throw new BadRequestException({ code: 'EMPTY_BODY', message: 'body is required.' });
    }
  }

  /** Slug uniqueness includes soft-deleted rows (URLs/slugs must stay globally unique). */
  private async assertSlugFree(slug: string, excludeId: string | null): Promise<void> {
    const existing = await this.pages.findOne({
      where: { slug },
      withDeleted: true,
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException({
        code: 'SLUG_EXISTS',
        message: `A page with slug "${slug}" already exists.`,
      });
    }
  }

  /**
   * Whether a published menu links this page slug. Degrades to `false` when the menus table does not yet
   * exist (cms-menus-be not merged) — the system-page guard still protects the seeded policy pages.
   */
  private async isMenuLinked(slug: string): Promise<boolean> {
    const hasMenuItems = await this.tableExists('cms_menu_items');
    if (!hasMenuItems) return false;
    const rows = await this.dataSource.query(
      `SELECT 1 FROM "cms_menu_items" WHERE "link_type" = 'page' AND "link_ref" = $1 LIMIT 1`,
      [slug],
    );
    return rows.length > 0;
  }

  private async tableExists(table: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 LIMIT 1`,
      [table],
    );
    return rows.length > 0;
  }

  private notFound(id: string): NotFoundException {
    return new NotFoundException({ code: 'PAGE_NOT_FOUND', message: `Page ${id} not found.` });
  }
}
