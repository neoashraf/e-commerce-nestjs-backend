import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { HomepageService } from '../services/homepage.service';
import { MenusService } from '../services/menus.service';
import { SlideOrmEntity } from '../../infrastructure/persistence/typeorm/entities/slide.orm-entity';
import { BannerOrmEntity } from '../../infrastructure/persistence/typeorm/entities/banner.orm-entity';
import { HomeSectionOrmEntity } from '../../infrastructure/persistence/typeorm/entities/home-section.orm-entity';
import { CategoryOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/category.orm-entity';
import { ProductOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/product.orm-entity';
import { ProductImageOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/product-image.orm-entity';

describe('Content — HomepageService', () => {
  let service: HomepageService;
  let slides: { find: jest.Mock };
  let banners: { find: jest.Mock };
  let sections: { find: jest.Mock };
  let categories: { find: jest.Mock };
  let products: { find: jest.Mock };
  let images: { find: jest.Mock };
  let menus: { getPublishedMenu: jest.Mock };

  const NOW = new Date('2026-06-10T00:00:00Z');

  beforeEach(async () => {
    slides = { find: jest.fn().mockResolvedValue([]) };
    banners = { find: jest.fn().mockResolvedValue([]) };
    sections = { find: jest.fn().mockResolvedValue([]) };
    categories = { find: jest.fn().mockResolvedValue([]) };
    products = { find: jest.fn().mockResolvedValue([]) };
    images = { find: jest.fn().mockResolvedValue([]) };
    menus = { getPublishedMenu: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HomepageService,
        { provide: getRepositoryToken(SlideOrmEntity), useValue: slides },
        { provide: getRepositoryToken(BannerOrmEntity), useValue: banners },
        { provide: getRepositoryToken(HomeSectionOrmEntity), useValue: sections },
        { provide: getRepositoryToken(CategoryOrmEntity), useValue: categories },
        { provide: getRepositoryToken(ProductOrmEntity), useValue: products },
        { provide: getRepositoryToken(ProductImageOrmEntity), useValue: images },
        { provide: MenusService, useValue: menus },
      ],
    }).compile();
    service = module.get(HomepageService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should drop slides outside their schedule window (FR-CMS-051)', async () => {
    slides.find.mockResolvedValue([
      { id: 's1', imageUrl: 'a', renditions: null, altText: 'a', headline: null, ctaLabel: null, linkType: 'url', linkRef: '/x', startsAt: null, endsAt: null },
      { id: 's2', imageUrl: 'b', renditions: null, altText: 'b', headline: null, ctaLabel: null, linkType: 'url', linkRef: '/y', startsAt: new Date('2026-07-01T00:00:00Z'), endsAt: null },
    ]);

    const payload = await service.getHomepage(NOW);

    expect(payload.slider.map((s) => s.id)).toEqual(['s1']); // future-scheduled s2 dropped
  });

  it('should group live banners by placement', async () => {
    banners.find.mockResolvedValue([
      { id: 'b1', placement: 'home_top', imageUrl: 'a', renditions: null, altText: 'a', linkType: 'url', linkRef: '/x', startsAt: null, endsAt: null },
    ]);

    const payload = await service.getHomepage(NOW);

    expect(payload.banners.home_top).toHaveLength(1);
  });

  it('should resolve featured_categories in configured order, omitting unpublished targets (BR-CMS-3)', async () => {
    sections.find.mockResolvedValue([
      { id: 'hs1', type: 'featured_categories', title: 'Shop', itemRefs: ['c2', 'c1', 'cMissing'], isPublished: true },
    ]);
    categories.find.mockResolvedValue([
      { id: 'c1', slug: 'boots', name: 'Boots', imageUrl: null, isPublished: true, deletedAt: null },
      { id: 'c2', slug: 'jerseys', name: 'Jerseys', imageUrl: null, isPublished: true, deletedAt: null },
    ]);

    const payload = await service.getHomepage(NOW);

    expect(payload.sections[0].items.map((i) => (i as { slug: string }).slug)).toEqual(['jerseys', 'boots']);
  });

  it('should include header/footer menus from the menus service', async () => {
    menus.getPublishedMenu.mockResolvedValue([{ label: 'X', link_type: 'url', link_ref: '/x', children: [] }]);
    const payload = await service.getHomepage(NOW);
    expect(payload.menus.header).toHaveLength(1);
    expect(payload.menus.footer).toHaveLength(1);
  });
});
