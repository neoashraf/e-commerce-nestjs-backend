import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';

import {
  MAX_ACTIVE_BANNERS_PER_PLACEMENT,
  MerchandisingService,
} from '../services/merchandising.service';
import { MEDIA_SERVICE } from '../ports/media.port';
import { SlideOrmEntity } from '../../infrastructure/persistence/typeorm/entities/slide.orm-entity';
import { BannerOrmEntity } from '../../infrastructure/persistence/typeorm/entities/banner.orm-entity';
import { HomeSectionOrmEntity } from '../../infrastructure/persistence/typeorm/entities/home-section.orm-entity';
import { CategoryOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/category.orm-entity';
import { ProductOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/product.orm-entity';

const repoMock = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  save: jest.fn().mockImplementation((r) => Promise.resolve({ id: 'new', ...r })),
  create: jest.fn().mockImplementation((r) => r),
  softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
  update: jest.fn(),
});

describe('Content — MerchandisingService', () => {
  let service: MerchandisingService;
  let slides: ReturnType<typeof repoMock>;
  let banners: ReturnType<typeof repoMock>;
  let sections: ReturnType<typeof repoMock>;
  let categories: ReturnType<typeof repoMock>;
  let products: ReturnType<typeof repoMock>;

  beforeEach(async () => {
    slides = repoMock();
    banners = repoMock();
    sections = repoMock();
    categories = repoMock();
    products = repoMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchandisingService,
        { provide: getRepositoryToken(SlideOrmEntity), useValue: slides },
        { provide: getRepositoryToken(BannerOrmEntity), useValue: banners },
        { provide: getRepositoryToken(HomeSectionOrmEntity), useValue: sections },
        { provide: getRepositoryToken(CategoryOrmEntity), useValue: categories },
        { provide: getRepositoryToken(ProductOrmEntity), useValue: products },
        { provide: MEDIA_SERVICE, useValue: { generateRenditions: jest.fn().mockResolvedValue({ detail: 'x' }) } },
      ],
    }).compile();
    service = module.get(MerchandisingService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should reject a slide with no alt text (FR-CMS-001/050)', async () => {
    await expect(
      service.createSlide({ image_url: 'i', alt_text: '  ', link_type: 'url', link_ref: '/x' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject an invalid schedule (ends_at <= starts_at)', async () => {
    await expect(
      service.createSlide({
        image_url: 'i',
        alt_text: 'a',
        link_type: 'url',
        link_ref: '/x',
        starts_at: '2026-06-10T00:00:00Z',
        ends_at: '2026-06-05T00:00:00Z',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject a slide whose internal link target does not resolve (FR-CMS-004)', async () => {
    categories.findOne.mockResolvedValue(null);
    await expect(
      service.createSlide({ image_url: 'i', alt_text: 'a', link_type: 'category', link_ref: 'missing' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should create a valid url slide with generated renditions', async () => {
    const slide = await service.createSlide({ image_url: 'i', alt_text: 'a', link_type: 'url', link_ref: '/x' });
    expect(slide.renditions).toEqual({ detail: 'x' });
  });

  it('should 409 when a placement is already at its active-banner limit (FR-CMS-011)', async () => {
    banners.find.mockResolvedValue(
      Array.from({ length: MAX_ACTIVE_BANNERS_PER_PLACEMENT }, (_, i) => ({ id: `b${i}`, isActive: true })),
    );
    await expect(
      service.createBanner({ placement: 'home_top', image_url: 'i', alt_text: 'a', link_type: 'url', link_ref: '/x' }),
    ).rejects.toThrow(ConflictException);
  });

  it('should reject a section with empty item_refs (FR-CMS-022)', async () => {
    await expect(
      service.createSection({ type: 'featured_products', title: 'New', item_refs: [] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject a section with an invalid item id', async () => {
    products.find.mockResolvedValue([{ id: 'p1' }]); // only 1 of 2 resolves
    await expect(
      service.createSection({ type: 'featured_products', title: 'New', item_refs: ['p1', 'p2'] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should create a valid featured_products section', async () => {
    products.find.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    const section = await service.createSection({
      type: 'featured_products',
      title: 'New Arrivals',
      item_refs: ['p1', 'p2'],
    });
    expect(section.title).toBe('New Arrivals');
  });
});
