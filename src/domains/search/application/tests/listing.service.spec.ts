import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';

import { ListingService } from '../services/listing.service';
import { FacetService } from '../services/facet.service';
import { ProductSearchDocumentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-search-document.orm-entity';
import { CategoryOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/category.orm-entity';

/** Mocked FacetService: resolves no facets, parses empty filters, applies nothing, builds no blocks. */
const mockFacetService = () => ({
  resolveForCategory: jest.fn().mockResolvedValue([]),
  resolveForSearch: jest.fn().mockResolvedValue([]),
  parse: jest.fn().mockReturnValue({ terms: new Map(), inStockOnly: false, onSaleOnly: false }),
  applyAll: jest.fn(),
  buildBlocks: jest.fn().mockResolvedValue([]),
  appliedFilters: jest.fn().mockReturnValue({}),
});

function makeQb(count: number, many: unknown[]) {
  const qb: Record<string, unknown> = {};
  for (const m of ['where', 'andWhere', 'addSelect', 'orderBy', 'addOrderBy', 'offset', 'limit']) {
    qb[m] = jest.fn().mockReturnValue(qb);
  }
  qb.getCount = jest.fn().mockResolvedValue(count);
  qb.getMany = jest.fn().mockResolvedValue(many);
  return qb;
}

describe('Search — ListingService', () => {
  let service: ListingService;
  let categories: { findOne: jest.Mock; find: jest.Mock };
  let documents: { createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    categories = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    documents = { createQueryBuilder: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListingService,
        { provide: getRepositoryToken(CategoryOrmEntity), useValue: categories },
        { provide: getRepositoryToken(ProductSearchDocumentOrmEntity), useValue: documents },
        { provide: FacetService, useValue: mockFacetService() },
      ],
    }).compile();
    service = module.get(ListingService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should 404 for an unknown or unpublished category slug (FR-SRCH-001)', async () => {
    categories.findOne.mockResolvedValue(null);
    await expect(service.browseCategory('ghost', {})).rejects.toThrow(NotFoundException);
  });

  it('should 404 for a soft-deleted category', async () => {
    categories.findOne.mockResolvedValue({
      id: 'c1',
      slug: 'boots',
      name: 'Boots',
      isPublished: true,
      deletedAt: new Date(),
      parentId: null,
    });
    await expect(service.browseCategory('boots', {})).rejects.toThrow(NotFoundException);
  });

  it('should return a published category listing with the contract envelope shape', async () => {
    categories.findOne.mockResolvedValue({
      id: 'c1',
      slug: 'boots',
      name: 'Boots',
      isPublished: true,
      deletedAt: null,
      parentId: null,
    });
    categories.find.mockResolvedValue([
      { id: 'c1', slug: 'boots', name: 'Boots', isPublished: true, deletedAt: null, parentId: null },
    ]);
    documents.createQueryBuilder.mockImplementation(() =>
      makeQb(1, [
        {
          productId: 'p1',
          slug: 'predator',
          title: 'Predator',
          brand: 'Adidas',
          primaryImage: null,
          effectivePrice: '100.00',
          basePrice: '120.00',
          onSale: true,
          availability: 'in_stock',
        },
      ]),
    );

    const result = await service.browseCategory('boots', { page: '1', limit: '24' });

    expect(result.data.scope).toMatchObject({ type: 'category', slug: 'boots', title: 'Boots' });
    expect(result.data.products[0]).toMatchObject({ id: 'p1', currency: 'BDT' });
    expect(result.data.sort).toBe('best_selling');
    expect(result.meta).toEqual({ page: 1, limit: 24, total: 1 });
  });
});
