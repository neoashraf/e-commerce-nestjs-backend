import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { SuggestService } from '../services/suggest.service';
import { ProductSearchDocumentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-search-document.orm-entity';
import { CategoryOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/category.orm-entity';

function makeQb(many: unknown[]) {
  const qb: Record<string, unknown> = {};
  for (const m of ['where', 'orderBy', 'addOrderBy', 'take']) {
    qb[m] = jest.fn().mockReturnValue(qb);
  }
  qb.getMany = jest.fn().mockResolvedValue(many);
  return qb;
}

describe('Search — SuggestService', () => {
  let service: SuggestService;
  let documents: { createQueryBuilder: jest.Mock };
  let categories: { find: jest.Mock };

  beforeEach(async () => {
    documents = { createQueryBuilder: jest.fn(() => makeQb([])) };
    categories = { find: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuggestService,
        { provide: getRepositoryToken(ProductSearchDocumentOrmEntity), useValue: documents },
        { provide: getRepositoryToken(CategoryOrmEntity), useValue: categories },
      ],
    }).compile();
    service = module.get(SuggestService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return empty arrays for a query below the minimum length (FR-SRCH-022)', async () => {
    const result = await service.suggest('p');
    expect(result).toEqual({
      query_suggestions: [],
      category_suggestions: [],
      product_suggestions: [],
    });
    expect(documents.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('should return product + category + query suggestions for a valid query (FR-SRCH-020/021)', async () => {
    documents.createQueryBuilder.mockReturnValue(
      makeQb([
        {
          productId: 'p1',
          slug: 'predator',
          title: 'Adidas Predator',
          primaryImage: 'img.webp',
          effectivePrice: '12500.00',
        },
      ]),
    );
    categories.find.mockResolvedValue([{ slug: 'football-boots', name: 'Football Boots' }]);

    const result = await service.suggest('pred');

    expect(result.product_suggestions[0]).toMatchObject({ id: 'p1', effective_price: '12500.00' });
    expect(result.category_suggestions).toEqual([{ slug: 'football-boots', title: 'Football Boots' }]);
    expect(result.query_suggestions).toContain('adidas predator');
  });
});
