import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { PagesService } from '../services/pages.service';
import { PageOrmEntity } from '../../infrastructure/persistence/typeorm/entities/page.orm-entity';

describe('Content — PagesService', () => {
  let service: PagesService;
  let pages: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    softDelete: jest.Mock;
  };
  let dataSource: { query: jest.Mock };

  const buildPage = (o: Partial<PageOrmEntity> = {}): PageOrmEntity =>
    ({
      id: 'pg_1',
      slug: 'size-guide',
      title: 'Size Guide',
      body: '<p>x</p>',
      seoTitle: null,
      seoDescription: null,
      isPublished: false,
      isSystem: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...o,
    }) as PageOrmEntity;

  beforeEach(async () => {
    pages = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((p) => Promise.resolve({ id: 'pg_new', ...p })),
      create: jest.fn().mockImplementation((p) => p),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    // menus table absent by default → isMenuLinked() degrades to false.
    dataSource = { query: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PagesService,
        { provide: getRepositoryToken(PageOrmEntity), useValue: pages },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(PagesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a page as draft by default (FR-CMS-040)', async () => {
    pages.findOne.mockResolvedValue(null);
    const created = await service.create({ slug: 'size-guide', title: 'Size Guide', body: '<p>x</p>' });
    expect(created.isPublished).toBe(false);
    expect(created.isSystem).toBe(false);
  });

  it('should reject an invalid slug', async () => {
    await expect(
      service.create({ slug: 'Bad Slug!', title: 'X', body: '<p>x</p>' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject an empty body', async () => {
    await expect(
      service.create({ slug: 'size-guide', title: 'X', body: '   ' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should 409 on a duplicate slug (incl. soft-deleted)', async () => {
    pages.findOne.mockResolvedValue(buildPage({ id: 'other' }));
    await expect(
      service.create({ slug: 'size-guide', title: 'X', body: '<p>x</p>' }),
    ).rejects.toThrow(ConflictException);
  });

  it('should block deleting a system page with PAGE_LINKED (FR-CMS-043)', async () => {
    pages.findOne.mockResolvedValue(buildPage({ isSystem: true }));
    await expect(service.remove('pg_1')).rejects.toMatchObject({
      response: { code: 'PAGE_LINKED' },
    });
    expect(pages.softDelete).not.toHaveBeenCalled();
  });

  it('should soft-delete a non-system, non-linked page', async () => {
    pages.findOne.mockResolvedValue(buildPage({ isSystem: false }));
    await service.remove('pg_1');
    expect(pages.softDelete).toHaveBeenCalledWith({ id: 'pg_1' });
  });

  it('should require confirmation to change a linked (system) page slug (FR-CMS-044)', async () => {
    pages.findOne
      .mockResolvedValueOnce(buildPage({ isSystem: true })) // getById
      .mockResolvedValueOnce(null); // assertSlugFree
    await expect(service.update('pg_1', { slug: 'new-slug' })).rejects.toMatchObject({
      response: { code: 'SLUG_CHANGE_REQUIRES_CONFIRMATION' },
    });
  });

  it('should allow a confirmed linked-slug change', async () => {
    pages.findOne
      .mockResolvedValueOnce(buildPage({ isSystem: true }))
      .mockResolvedValueOnce(null);
    const updated = await service.update('pg_1', { slug: 'new-slug', confirm_slug_change: true });
    expect(updated.slug).toBe('new-slug');
  });

  it('should return only a published page by slug (FR-CMS-061)', async () => {
    pages.findOne.mockResolvedValue(buildPage({ isPublished: true, slug: 'exchange-policy' }));
    const result = await service.getPublishedBySlug('exchange-policy');
    expect(result).toMatchObject({ slug: 'exchange-policy', seo: { title: null, description: null } });
    expect(pages.findOne).toHaveBeenCalledWith({ where: { slug: 'exchange-policy', isPublished: true } });
  });

  it('should 404 a draft/missing page by slug', async () => {
    pages.findOne.mockResolvedValue(null);
    await expect(service.getPublishedBySlug('draft-page')).rejects.toThrow(NotFoundException);
  });
});
