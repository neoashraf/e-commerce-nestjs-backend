import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { CategoryOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/category.orm-entity';
import { ProductOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/product.orm-entity';
import { IMediaService, MEDIA_SERVICE } from '../ports/media.port';
import { BannerOrmEntity } from '../../infrastructure/persistence/typeorm/entities/banner.orm-entity';
import { HomeSectionOrmEntity } from '../../infrastructure/persistence/typeorm/entities/home-section.orm-entity';
import { SlideOrmEntity } from '../../infrastructure/persistence/typeorm/entities/slide.orm-entity';

/** Max active banners per placement (configurable; BR-CMS-8 / FR-CMS-011). */
export const MAX_ACTIVE_BANNERS_PER_PLACEMENT = 3;

const VALID_LINK_TYPES = ['category', 'product', 'page', 'url'];
const VALID_SECTION_TYPES = ['featured_categories', 'featured_products'];

export interface CreateSlideCommand {
  image_url: string;
  alt_text: string;
  headline?: string | null;
  subtext?: string | null;
  cta_label?: string | null;
  link_type: string;
  link_ref: string;
  display_order?: number;
  is_published?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
}

export interface CreateBannerCommand {
  placement: string;
  image_url: string;
  alt_text: string;
  link_type: string;
  link_ref: string;
  priority?: number;
  is_active?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
}

export interface CreateSectionCommand {
  type: string;
  title: string;
  item_refs: string[];
  display_order?: number;
  is_published?: boolean;
}

/**
 * CMS merchandising admin (FR-CMS-001–022, 050): CRUD + reorder for slides/banners/home-sections, with
 * required alt text + rendition generation (media port), link-target validation (FR-CMS-004), schedule
 * validation (`ends_at > starts_at`), per-placement active-banner limit (`409`, FR-CMS-011), and section
 * item validation (non-empty, resolvable category/product ids). Read-time "live" computation + the
 * homepage payload aggregation live in {@link HomepageService}.
 */
@Injectable()
export class MerchandisingService {
  constructor(
    @InjectRepository(SlideOrmEntity)
    private readonly slides: Repository<SlideOrmEntity>,
    @InjectRepository(BannerOrmEntity)
    private readonly banners: Repository<BannerOrmEntity>,
    @InjectRepository(HomeSectionOrmEntity)
    private readonly sections: Repository<HomeSectionOrmEntity>,
    @InjectRepository(CategoryOrmEntity)
    private readonly categories: Repository<CategoryOrmEntity>,
    @InjectRepository(ProductOrmEntity)
    private readonly products: Repository<ProductOrmEntity>,
    @Inject(MEDIA_SERVICE)
    private readonly media: IMediaService,
  ) {}

  // ---------------------------------------------------------------------------
  // Slides (FR-CMS-001–004)
  // ---------------------------------------------------------------------------

  listSlides(): Promise<SlideOrmEntity[]> {
    return this.slides.find({ order: { displayOrder: 'ASC' } });
  }

  async createSlide(cmd: CreateSlideCommand): Promise<SlideOrmEntity> {
    this.assertAltText(cmd.alt_text);
    this.assertLinkType(cmd.link_type);
    const [startsAt, endsAt] = this.assertSchedule(cmd.starts_at, cmd.ends_at);
    await this.assertLinkResolves(cmd.link_type, cmd.link_ref);
    const renditions = await this.media.generateRenditions(cmd.image_url);
    return this.slides.save(
      this.slides.create({
        imageUrl: cmd.image_url,
        renditions,
        altText: cmd.alt_text,
        headline: cmd.headline ?? null,
        subtext: cmd.subtext ?? null,
        ctaLabel: cmd.cta_label ?? null,
        linkType: cmd.link_type,
        linkRef: cmd.link_ref,
        displayOrder: cmd.display_order ?? 0,
        isPublished: cmd.is_published ?? false,
        startsAt,
        endsAt,
      }),
    );
  }

  async updateSlide(id: string, cmd: Partial<CreateSlideCommand>): Promise<SlideOrmEntity> {
    const slide = await this.slides.findOne({ where: { id } });
    if (!slide) throw this.notFound('SLIDE_NOT_FOUND', id);
    if (cmd.alt_text !== undefined) {
      this.assertAltText(cmd.alt_text);
      slide.altText = cmd.alt_text;
    }
    if (cmd.link_type !== undefined) {
      this.assertLinkType(cmd.link_type);
      slide.linkType = cmd.link_type;
    }
    if (cmd.link_ref !== undefined) slide.linkRef = cmd.link_ref;
    if (cmd.link_type !== undefined || cmd.link_ref !== undefined) {
      await this.assertLinkResolves(slide.linkType, slide.linkRef);
    }
    if (cmd.starts_at !== undefined || cmd.ends_at !== undefined) {
      const [startsAt, endsAt] = this.assertSchedule(
        cmd.starts_at !== undefined ? cmd.starts_at : slide.startsAt?.toISOString() ?? null,
        cmd.ends_at !== undefined ? cmd.ends_at : slide.endsAt?.toISOString() ?? null,
      );
      slide.startsAt = startsAt;
      slide.endsAt = endsAt;
    }
    if (cmd.image_url !== undefined) {
      slide.imageUrl = cmd.image_url;
      slide.renditions = await this.media.generateRenditions(cmd.image_url);
    }
    if (cmd.headline !== undefined) slide.headline = cmd.headline;
    if (cmd.subtext !== undefined) slide.subtext = cmd.subtext;
    if (cmd.cta_label !== undefined) slide.ctaLabel = cmd.cta_label;
    if (cmd.display_order !== undefined) slide.displayOrder = cmd.display_order;
    if (cmd.is_published !== undefined) slide.isPublished = cmd.is_published;
    return this.slides.save(slide);
  }

  async deleteSlide(id: string): Promise<void> {
    const res = await this.slides.softDelete({ id });
    if (!res.affected) throw this.notFound('SLIDE_NOT_FOUND', id);
  }

  async reorderSlides(orderedIds: string[]): Promise<void> {
    await this.applyOrder(this.slides, orderedIds);
  }

  // ---------------------------------------------------------------------------
  // Banners (FR-CMS-010–012)
  // ---------------------------------------------------------------------------

  listBanners(placement?: string): Promise<BannerOrmEntity[]> {
    return this.banners.find({
      where: placement ? { placement } : {},
      order: { priority: 'ASC' },
    });
  }

  async createBanner(cmd: CreateBannerCommand): Promise<BannerOrmEntity> {
    this.assertAltText(cmd.alt_text);
    this.assertLinkType(cmd.link_type);
    const [startsAt, endsAt] = this.assertSchedule(cmd.starts_at, cmd.ends_at);
    await this.assertLinkResolves(cmd.link_type, cmd.link_ref);
    const isActive = cmd.is_active ?? true;
    if (isActive) await this.assertPlacementHasRoom(cmd.placement, null);
    const renditions = await this.media.generateRenditions(cmd.image_url);
    return this.banners.save(
      this.banners.create({
        placement: cmd.placement,
        imageUrl: cmd.image_url,
        renditions,
        altText: cmd.alt_text,
        linkType: cmd.link_type,
        linkRef: cmd.link_ref,
        priority: cmd.priority ?? 0,
        isActive,
        startsAt,
        endsAt,
      }),
    );
  }

  async updateBanner(id: string, cmd: Partial<CreateBannerCommand>): Promise<BannerOrmEntity> {
    const banner = await this.banners.findOne({ where: { id } });
    if (!banner) throw this.notFound('BANNER_NOT_FOUND', id);
    if (cmd.alt_text !== undefined) {
      this.assertAltText(cmd.alt_text);
      banner.altText = cmd.alt_text;
    }
    if (cmd.link_type !== undefined) {
      this.assertLinkType(cmd.link_type);
      banner.linkType = cmd.link_type;
    }
    if (cmd.link_ref !== undefined) banner.linkRef = cmd.link_ref;
    if (cmd.link_type !== undefined || cmd.link_ref !== undefined) {
      await this.assertLinkResolves(banner.linkType, banner.linkRef);
    }
    if (cmd.starts_at !== undefined || cmd.ends_at !== undefined) {
      const [startsAt, endsAt] = this.assertSchedule(
        cmd.starts_at !== undefined ? cmd.starts_at : banner.startsAt?.toISOString() ?? null,
        cmd.ends_at !== undefined ? cmd.ends_at : banner.endsAt?.toISOString() ?? null,
      );
      banner.startsAt = startsAt;
      banner.endsAt = endsAt;
    }
    // Activating (false→true) must respect the placement limit (FR-CMS-011).
    if (cmd.is_active === true && !banner.isActive) {
      await this.assertPlacementHasRoom(cmd.placement ?? banner.placement, banner.id);
    }
    if (cmd.placement !== undefined) banner.placement = cmd.placement;
    if (cmd.image_url !== undefined) {
      banner.imageUrl = cmd.image_url;
      banner.renditions = await this.media.generateRenditions(cmd.image_url);
    }
    if (cmd.priority !== undefined) banner.priority = cmd.priority;
    if (cmd.is_active !== undefined) banner.isActive = cmd.is_active;
    return this.banners.save(banner);
  }

  async deleteBanner(id: string): Promise<void> {
    const res = await this.banners.softDelete({ id });
    if (!res.affected) throw this.notFound('BANNER_NOT_FOUND', id);
  }

  // ---------------------------------------------------------------------------
  // Home sections (FR-CMS-020–022)
  // ---------------------------------------------------------------------------

  listSections(): Promise<HomeSectionOrmEntity[]> {
    return this.sections.find({ order: { displayOrder: 'ASC' } });
  }

  async createSection(cmd: CreateSectionCommand): Promise<HomeSectionOrmEntity> {
    this.assertSectionType(cmd.type);
    await this.assertSectionItems(cmd.type, cmd.item_refs);
    return this.sections.save(
      this.sections.create({
        type: cmd.type,
        title: cmd.title,
        itemRefs: cmd.item_refs,
        displayOrder: cmd.display_order ?? 0,
        isPublished: cmd.is_published ?? false,
      }),
    );
  }

  async updateSection(id: string, cmd: Partial<CreateSectionCommand>): Promise<HomeSectionOrmEntity> {
    const section = await this.sections.findOne({ where: { id } });
    if (!section) throw this.notFound('SECTION_NOT_FOUND', id);
    if (cmd.type !== undefined) {
      this.assertSectionType(cmd.type);
      section.type = cmd.type;
    }
    if (cmd.item_refs !== undefined) {
      await this.assertSectionItems(section.type, cmd.item_refs);
      section.itemRefs = cmd.item_refs;
    }
    if (cmd.title !== undefined) section.title = cmd.title;
    if (cmd.display_order !== undefined) section.displayOrder = cmd.display_order;
    if (cmd.is_published !== undefined) section.isPublished = cmd.is_published;
    return this.sections.save(section);
  }

  async deleteSection(id: string): Promise<void> {
    const res = await this.sections.softDelete({ id });
    if (!res.affected) throw this.notFound('SECTION_NOT_FOUND', id);
  }

  async reorderSections(orderedIds: string[]): Promise<void> {
    await this.applyOrder(this.sections, orderedIds);
  }

  // ---------------------------------------------------------------------------
  // Validation helpers
  // ---------------------------------------------------------------------------

  private assertAltText(altText: string): void {
    if (!altText || altText.trim() === '') {
      throw new BadRequestException({ code: 'ALT_TEXT_REQUIRED', message: 'alt_text is required.' });
    }
  }

  private assertLinkType(linkType: string): void {
    if (!VALID_LINK_TYPES.includes(linkType)) {
      throw new BadRequestException({
        code: 'INVALID_LINK_TYPE',
        message: `link_type must be one of ${VALID_LINK_TYPES.join(', ')}.`,
      });
    }
  }

  private assertSectionType(type: string): void {
    if (!VALID_SECTION_TYPES.includes(type)) {
      throw new BadRequestException({
        code: 'INVALID_SECTION_TYPE',
        message: `type must be one of ${VALID_SECTION_TYPES.join(', ')}.`,
      });
    }
  }

  /** Parse + validate the schedule window; returns [startsAt, endsAt] dates or nulls. */
  private assertSchedule(
    startsAtRaw: string | null | undefined,
    endsAtRaw: string | null | undefined,
  ): [Date | null, Date | null] {
    const startsAt = startsAtRaw ? new Date(startsAtRaw) : null;
    const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;
    if (startsAt && endsAt && endsAt <= startsAt) {
      throw new BadRequestException({
        code: 'INVALID_SCHEDULE',
        message: 'ends_at must be after starts_at.',
      });
    }
    return [startsAt, endsAt];
  }

  /** Internal link targets must resolve to a published entity (FR-CMS-004); url is well-formed-ish. */
  private async assertLinkResolves(linkType: string, linkRef: string): Promise<void> {
    if (linkType === 'url') {
      if (!linkRef || linkRef.trim() === '') {
        throw new BadRequestException({ code: 'INVALID_LINK_REF', message: 'link_ref is required.' });
      }
      return;
    }
    if (linkType === 'category') {
      const cat = await this.categories.findOne({ where: { slug: linkRef } });
      if (!cat || !cat.isPublished) throw this.unresolvedLink(linkRef);
      return;
    }
    if (linkType === 'product') {
      const product = await this.products.findOne({ where: { slug: linkRef } });
      if (!product || product.status !== 'published') throw this.unresolvedLink(linkRef);
      return;
    }
    // page resolution is the pages service's domain; a missing page is a soft omission at read, but on
    // save we require a non-empty ref (a published-page check would couple modules tighter than needed).
    if (linkType === 'page' && (!linkRef || linkRef.trim() === '')) {
      throw new BadRequestException({ code: 'INVALID_LINK_REF', message: 'link_ref is required.' });
    }
  }

  private async assertSectionItems(type: string, itemRefs: string[]): Promise<void> {
    if (!itemRefs || itemRefs.length === 0) {
      throw new BadRequestException({ code: 'EMPTY_ITEMS', message: 'item_refs cannot be empty.' });
    }
    if (type === 'featured_categories') {
      const found = await this.categories.find({ where: { id: In(itemRefs) } });
      if (found.length !== new Set(itemRefs).size) {
        throw new BadRequestException({ code: 'INVALID_ITEM', message: 'One or more category ids are invalid.' });
      }
    } else {
      const found = await this.products.find({ where: { id: In(itemRefs) } });
      if (found.length !== new Set(itemRefs).size) {
        throw new BadRequestException({ code: 'INVALID_ITEM', message: 'One or more product ids are invalid.' });
      }
    }
  }

  /** Reject a new active banner that would exceed the per-placement active limit (FR-CMS-011). */
  private async assertPlacementHasRoom(placement: string, excludeId: string | null): Promise<void> {
    const active = await this.banners.find({ where: { placement, isActive: true } });
    const count = active.filter((b) => b.id !== excludeId).length;
    if (count >= MAX_ACTIVE_BANNERS_PER_PLACEMENT) {
      throw new ConflictException({
        code: 'PLACEMENT_LIMIT_REACHED',
        message: `Placement "${placement}" already has ${MAX_ACTIVE_BANNERS_PER_PLACEMENT} active banners.`,
      });
    }
  }

  /** Apply an explicit order to a set of rows by id (reorder endpoints). */
  private async applyOrder(
    repo: Repository<SlideOrmEntity> | Repository<HomeSectionOrmEntity>,
    orderedIds: string[],
  ): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      await repo.update({ id: orderedIds[i] }, { displayOrder: i });
    }
  }

  private unresolvedLink(ref: string): BadRequestException {
    return new BadRequestException({
      code: 'LINK_NOT_RESOLVED',
      message: `link_ref "${ref}" does not resolve to a published entity.`,
    });
  }

  private notFound(code: string, id: string): NotFoundException {
    return new NotFoundException({ code, message: `Not found: ${id}.` });
  }
}
