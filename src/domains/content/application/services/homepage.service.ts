import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';

import { CategoryOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/category.orm-entity';
import { ProductImageOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/product-image.orm-entity';
import { ProductOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/product.orm-entity';
import { ProductStatus, ProductType } from '../../../catalog/domain/enums/product-type.enum';
import { ProductSearchDocumentOrmEntity } from '../../../search/infrastructure/persistence/typeorm/entities/product-search-document.orm-entity';
import { BannerOrmEntity } from '../../infrastructure/persistence/typeorm/entities/banner.orm-entity';
import { HomeSectionOrmEntity } from '../../infrastructure/persistence/typeorm/entities/home-section.orm-entity';
import { SlideOrmEntity } from '../../infrastructure/persistence/typeorm/entities/slide.orm-entity';
import { MenusService, PublicMenuNode } from './menus.service';

export interface HomepagePayload {
  slider: SlidePayload[];
  banners: Record<string, BannerPayload[]>;
  sections: SectionPayload[];
  menus: { header: PublicMenuNode[]; footer: PublicMenuNode[] };
  seo: { title: string; description: string };
}

interface SlidePayload {
  id: string;
  image: string;
  alt_text: string;
  headline: string | null;
  cta_label: string | null;
  link_type: string;
  link_ref: string;
}
interface BannerPayload {
  id: string;
  image: string;
  alt_text: string;
  link_type: string;
  link_ref: string;
}
interface SectionPayload {
  id: string;
  type: string;
  title: string;
  items: Record<string, unknown>[];
}

const HOMEPAGE_SEO = {
  title: 'SportShop BD — Football Boots, Jerseys & More',
  description: 'Authentic football boots, jerseys, turf and futsal shoes, and accessories in Bangladesh.',
};

/**
 * Homepage content payload aggregation (FR-CMS-060). Serves only currently-live content: published +
 * within schedule window (computed at read, FR-CMS-051). Resolves featured-section item refs to CAT
 * category/product data, excludes unpublished/soft-deleted targets (BR-CMS-3, §12.3), groups banners by
 * placement, and pulls header/footer menus from {@link MenusService}. Broken internal targets are
 * omitted, never errored.
 */
@Injectable()
export class HomepageService {
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
    @InjectRepository(ProductImageOrmEntity)
    private readonly images: Repository<ProductImageOrmEntity>,
    @InjectRepository(ProductSearchDocumentOrmEntity)
    private readonly searchDocs: Repository<ProductSearchDocumentOrmEntity>,
    private readonly menus: MenusService,
  ) {}

  async getHomepage(now: Date = new Date()): Promise<HomepagePayload> {
    const [slides, banners, sections, header, footer] = await Promise.all([
      this.slides.find({ where: { isPublished: true }, order: { displayOrder: 'ASC' } }),
      this.banners.find({ where: { isActive: true }, order: { priority: 'ASC' } }),
      this.sections.find({ where: { isPublished: true }, order: { displayOrder: 'ASC' } }),
      this.menus.getPublishedMenu('header'),
      this.menus.getPublishedMenu('footer'),
    ]);

    const liveSlides = slides.filter((s) => this.isLive(s.startsAt, s.endsAt, now));
    const liveBanners = banners.filter((b) => this.isLive(b.startsAt, b.endsAt, now));

    const bannersByPlacement: Record<string, BannerPayload[]> = {};
    for (const b of liveBanners) {
      (bannersByPlacement[b.placement] ??= []).push({
        id: b.id,
        image: b.renditions?.detail ?? b.imageUrl,
        alt_text: b.altText,
        link_type: b.linkType,
        link_ref: b.linkRef,
      });
    }

    const sectionPayloads: SectionPayload[] = [];
    for (const section of sections) {
      const items =
        section.type === 'featured_categories'
          ? await this.resolveCategories(section.itemRefs)
          : await this.resolveProducts(section.itemRefs, now);
      // A section whose targets all resolved away is still returned (empty items) so the FE can skip it.
      sectionPayloads.push({ id: section.id, type: section.type, title: section.title, items });
    }

    return {
      slider: liveSlides.map((s) => ({
        id: s.id,
        image: s.renditions?.detail ?? s.imageUrl,
        alt_text: s.altText,
        headline: s.headline,
        cta_label: s.ctaLabel,
        link_type: s.linkType,
        link_ref: s.linkRef,
      })),
      banners: bannersByPlacement,
      sections: sectionPayloads,
      menus: { header, footer },
      seo: HOMEPAGE_SEO,
    };
  }

  /** Resolve featured category refs → published categories in the configured order (BR-CMS-3). */
  private async resolveCategories(refs: string[]): Promise<Record<string, unknown>[]> {
    if (refs.length === 0) return [];
    const rows = await this.categories.find({ where: { id: In(refs), isPublished: true } });
    const byId = new Map(rows.filter((c) => c.deletedAt === null).map((c) => [c.id, c]));
    return refs
      .map((id) => byId.get(id))
      .filter((c): c is CategoryOrmEntity => !!c)
      .map((c) => ({ slug: c.slug, title: c.name, image: c.imageUrl }));
  }

  /** Resolve featured product refs → published products (with primary image + effective price). */
  private async resolveProducts(refs: string[], now: Date): Promise<Record<string, unknown>[]> {
    if (refs.length === 0) return [];
    const rows = await this.products.find({
      where: { id: In(refs), status: ProductStatus.PUBLISHED, deletedAt: IsNull() },
    });
    const byId = new Map(rows.map((p) => [p.id, p]));
    const ordered = refs.map((id) => byId.get(id)).filter((p): p is ProductOrmEntity => !!p);

    const imageIds = ordered.map((p) => p.primaryImageId).filter((id): id is string => !!id);
    const imageById = new Map(
      (imageIds.length > 0 ? await this.images.find({ where: { id: In(imageIds) } }) : []).map((img) => [
        img.id,
        img,
      ]),
    );

    // RW6: the published search mirror carries the precomputed card fields (hover_image, swatches,
    // name_bn, requires_variant, merch_label) — enrich each section item so the home rails render the
    // full v2 ProductCard. A product not yet indexed falls back to product-derivable fields only.
    const docById = new Map(
      (await this.searchDocs.find({ where: { productId: In(ordered.map((p) => p.id)) } })).map(
        (d) => [d.productId, d],
      ),
    );

    return ordered.map((p) => {
      const img = p.primaryImageId ? imageById.get(p.primaryImageId) : undefined;
      const doc = docById.get(p.id);
      return {
        slug: p.slug,
        title: p.name,
        name_bn: p.nameBn ?? null,
        effective_price: this.effectivePrice(p, now),
        base_price: Number(p.basePrice).toFixed(2),
        on_sale: this.isOnSale(p, now),
        image: img?.renditions?.listing ?? img?.url ?? null,
        hover_image: doc?.hoverImage ?? null,
        swatches: doc?.swatches ?? [],
        requires_variant: doc?.requiresVariant ?? p.type === ProductType.CONFIGURABLE,
        merch_label: doc?.merchLabel ?? (p.isNew ? ('new' as const) : null),
      };
    });
  }

  private effectivePrice(p: ProductOrmEntity, now: Date): string {
    return Number(this.isOnSale(p, now) && p.salePrice !== null ? p.salePrice : p.basePrice).toFixed(2);
  }

  /** Sale active = a sale price within the optional schedule window at read time (BR-CAT-6). */
  private isOnSale(p: ProductOrmEntity, now: Date): boolean {
    return (
      p.salePrice !== null &&
      !!p.saleStartsAt &&
      !!p.saleEndsAt &&
      now >= p.saleStartsAt &&
      now <= p.saleEndsAt
    );
  }

  /** "Live" = within the optional schedule window at read time (FR-CMS-051). */
  private isLive(startsAt: Date | null, endsAt: Date | null, now: Date): boolean {
    if (startsAt && now < startsAt) return false;
    if (endsAt && now > endsAt) return false;
    return true;
  }
}
