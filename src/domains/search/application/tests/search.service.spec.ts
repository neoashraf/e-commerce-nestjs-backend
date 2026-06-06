import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { SearchService } from '../services/search.service';
import { SearchConfigService } from '../services/search-config.service';
import { QueryLogService } from '../services/query-log.service';
import { FacetService } from '../services/facet.service';
import { ProductSearchDocumentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-search-document.orm-entity';
import { CategoryOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/category.orm-entity';

/** Mocked FacetService — no facets, empty filters, applyAll/buildBlocks no-ops. */
const mockFacetService = () => ({
  resolveForSearch: jest.fn().mockResolvedValue([]),
  resolveForCategory: jest.fn().mockResolvedValue([]),
  parse: jest.fn().mockReturnValue({ terms: new Map(), inStockOnly: false, onSaleOnly: false }),
  applyAll: jest.fn(),
  buildBlocks: jest.fn().mockResolvedValue([]),
  appliedFilters: jest.fn().mockReturnValue({}),
});

/** Chainable query-builder stub whose getCount/getMany are configurable per test. */
function makeQb(count: number, many: unknown[]) {
  const qb: Record<string, unknown> = {};
  for (const m of ['where', 'andWhere', 'addSelect', 'orderBy', 'addOrderBy', 'offset', 'limit', 'take']) {
    qb[m] = jest.fn().mockReturnValue(qb);
  }
  qb.getCount = jest.fn().mockResolvedValue(count);
  qb.getMany = jest.fn().mockResolvedValue(many);
  return qb;
}

describe('Search — SearchService', () => {
  let service: SearchService;
  let documents: { createQueryBuilder: jest.Mock };
  let categories: { find: jest.Mock };
  let config: { matchRedirect: jest.Mock; activeSynonymGroups: jest.Mock };
  let queryLog: { log: jest.Mock };

  const buildDoc = (o: Partial<ProductSearchDocumentOrmEntity> = {}): ProductSearchDocumentOrmEntity =>
    ({
      productId: 'p1',
      slug: 'adidas-predator',
      title: 'Adidas Predator',
      brand: 'Adidas',
      primaryImage: null,
      effectivePrice: '12500.00',
      basePrice: '14000.00',
      onSale: true,
      availability: 'in_stock',
      ...o,
    }) as ProductSearchDocumentOrmEntity;

  beforeEach(async () => {
    documents = { createQueryBuilder: jest.fn() };
    categories = { find: jest.fn().mockResolvedValue([]) };
    config = {
      matchRedirect: jest.fn().mockResolvedValue(null),
      activeSynonymGroups: jest.fn().mockResolvedValue([]),
    };
    queryLog = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: getRepositoryToken(ProductSearchDocumentOrmEntity), useValue: documents },
        { provide: getRepositoryToken(CategoryOrmEntity), useValue: categories },
        { provide: SearchConfigService, useValue: config },
        { provide: QueryLogService, useValue: queryLog },
        { provide: FacetService, useValue: mockFacetService() },
      ],
    }).compile();
    service = module.get(SearchService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should short-circuit to a redirect and still log the query (FR-SRCH-013/014, BR-SRCH-7)', async () => {
    config.matchRedirect.mockResolvedValue({ targetType: 'category', targetRef: 'predator-collection' });

    const result = await service.search('predator', {});

    expect(result.data.redirect).toEqual({ target_type: 'category', target_ref: 'predator-collection' });
    expect(result.data.products).toEqual([]);
    expect(queryLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ normalizedText: 'predator', resultCount: 0 }),
    );
  });

  it('should return ranked products from the FTS pass and log result count', async () => {
    documents.createQueryBuilder
      .mockReturnValueOnce(makeQb(1, [])) // countFts
      .mockReturnValueOnce(makeQb(1, [buildDoc()])); // runFts

    const result = await service.search('predator', {});

    expect(result.data.products).toHaveLength(1);
    expect(result.data.products[0]).toMatchObject({ id: 'p1', currency: 'BDT', availability: 'in_stock' });
    expect(result.meta.total).toBe(1);
    expect(queryLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ normalizedText: 'predator', resultCount: 1 }),
    );
  });

  it('should fall back to trigram fuzzy match when FTS finds nothing (typo tolerance, §12.5)', async () => {
    documents.createQueryBuilder
      .mockReturnValueOnce(makeQb(0, [])) // countFts → 0
      .mockReturnValueOnce(makeQb(1, [])) // countTrigram → 1
      .mockReturnValueOnce(makeQb(1, [buildDoc({ title: 'Adidas Predator' })])); // runTrigram

    const result = await service.search('addidas predtor', {});

    expect(result.data.products).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });

  it('should return zero-result recovery with popular categories when nothing matches (FR-SRCH-060)', async () => {
    documents.createQueryBuilder
      .mockReturnValueOnce(makeQb(0, [])) // countFts → 0
      .mockReturnValueOnce(makeQb(0, [])); // countTrigram → 0
    categories.find.mockResolvedValue([{ slug: 'football-boots', name: 'Football Boots' }]);

    const result = await service.search('zxqw nonsense', {});

    expect(result.data.products).toEqual([]);
    expect(result.data.suggestions).not.toBeNull();
    expect(result.data.suggestions?.popular_categories).toEqual([
      { slug: 'football-boots', title: 'Football Boots' },
    ]);
    expect(queryLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ resultCount: 0 }),
    );
  });
});
