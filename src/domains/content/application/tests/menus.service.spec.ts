import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { MenusService } from '../services/menus.service';
import { MenuItemOrmEntity } from '../../infrastructure/persistence/typeorm/entities/menu-item.orm-entity';
import { PageOrmEntity } from '../../infrastructure/persistence/typeorm/entities/page.orm-entity';
import { CategoryOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/category.orm-entity';

describe('Content — MenusService', () => {
  let service: MenusService;
  let items: { find: jest.Mock; count: jest.Mock };
  let categories: { findOne: jest.Mock };
  let pages: { findOne: jest.Mock };
  let saved: unknown[];

  beforeEach(async () => {
    items = { find: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) };
    categories = { findOne: jest.fn() };
    pages = { findOne: jest.fn() };
    saved = [];

    const dataSource = {
      transaction: jest.fn().mockImplementation((cb) =>
        cb({
          getRepository: () => ({
            delete: jest.fn().mockResolvedValue({ affected: 0 }),
            create: (r: Record<string, unknown>) => r,
            save: jest.fn().mockImplementation((r: Record<string, unknown>) => {
              const row = { id: `m${saved.length}`, ...r };
              saved.push(row);
              return Promise.resolve(row);
            }),
          }),
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenusService,
        { provide: getRepositoryToken(MenuItemOrmEntity), useValue: items },
        { provide: getRepositoryToken(CategoryOrmEntity), useValue: categories },
        { provide: getRepositoryToken(PageOrmEntity), useValue: pages },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(MenusService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should reject an invalid menu name', async () => {
    await expect(service.getTree('sidebar')).rejects.toThrow(BadRequestException);
  });

  it('should replace a header tree with one level of children (FR-CMS-030)', async () => {
    await service.replaceTree('header', [
      {
        label: 'Football Boots',
        link_type: 'category',
        link_ref: 'football-boots',
        children: [{ label: 'Firm Ground', link_type: 'category', link_ref: 'firm-ground' }],
      },
    ]);
    expect(saved).toHaveLength(2);
    expect(saved[1]).toMatchObject({ parentId: 'm0', label: 'Firm Ground' });
  });

  it('should reject nesting deeper than one level', async () => {
    await expect(
      service.replaceTree('header', [
        {
          label: 'A',
          link_type: 'url',
          link_ref: '/a',
          children: [
            {
              label: 'B',
              link_type: 'url',
              link_ref: '/b',
              children: [{ label: 'C', link_type: 'url', link_ref: '/c' }],
            } as never,
          ],
        },
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject a menu item without a label', async () => {
    await expect(
      service.replaceTree('footer', [{ label: '  ', link_type: 'url', link_ref: '/x' }]),
    ).rejects.toThrow(BadRequestException);
  });

  it('should omit a published item whose target is unresolved/unpublished (FR-CMS-031)', async () => {
    items.find.mockResolvedValue([
      { id: 't1', parentId: null, label: 'Boots', linkType: 'category', linkRef: 'football-boots', isPublished: true, displayOrder: 1 },
      { id: 't2', parentId: null, label: 'Ghost', linkType: 'category', linkRef: 'missing', isPublished: true, displayOrder: 2 },
    ]);
    categories.findOne.mockImplementation(({ where }: { where: { slug: string } }) =>
      where.slug === 'football-boots'
        ? Promise.resolve({ slug: 'football-boots', isPublished: true, deletedAt: null })
        : Promise.resolve(null),
    );

    const menu = await service.getPublishedMenu('header');

    expect(menu.map((m) => m.label)).toEqual(['Boots']);
  });

  it('should report a page slug linked by a published menu (PAGE_LINKED guard)', async () => {
    items.count.mockResolvedValue(1);
    expect(await service.isPageLinked('privacy-policy')).toBe(true);
    expect(items.count).toHaveBeenCalledWith({
      where: { linkType: 'page', linkRef: 'privacy-policy', isPublished: true },
    });
  });
});
