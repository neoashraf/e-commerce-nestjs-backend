import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { FacetCountService, ScopedQueryFactory } from '../services/facet-count.service';
import { FacetFilterService } from '../services/facet-filter.service';
import { FacetSource, FacetType } from '../../domain/search-enums';
import { ResolvedFacet } from '../services/facet.types';
import { AttributeOptionOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/attribute-option.orm-entity';
import { CategoryOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/category.orm-entity';

const facet = (over: Partial<ResolvedFacet>): ResolvedFacet => ({
  key: 'brand',
  label: 'Brand',
  type: FacetType.TERM,
  source: FacetSource.BRAND,
  sourceAttributeKey: null,
  isMultiSelect: true,
  hideZeroCounts: true,
  displayOrder: 1,
  ...over,
});

/** A scoped-query stub whose getRawMany returns the given raw docs; chainable select/apply. */
function makeScoped(rawDocs: unknown[]): ScopedQueryFactory {
  return (() => {
    const qb: Record<string, unknown> = {};
    for (const m of ['where', 'andWhere', 'select', 'setParameter']) {
      qb[m] = jest.fn().mockReturnValue(qb);
    }
    qb.getRawMany = jest.fn().mockResolvedValue(rawDocs);
    return qb;
  }) as unknown as ScopedQueryFactory;
}

describe('Search — FacetCountService', () => {
  let service: FacetCountService;
  let options: { find: jest.Mock };
  let categories: { find: jest.Mock };

  beforeEach(async () => {
    options = { find: jest.fn().mockResolvedValue([]) };
    categories = { find: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FacetCountService,
        FacetFilterService,
        { provide: getRepositoryToken(AttributeOptionOrmEntity), useValue: options },
        { provide: getRepositoryToken(CategoryOrmEntity), useValue: categories },
      ],
    }).compile();
    service = module.get(FacetCountService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should count brand term values from the candidate set', async () => {
    const scoped = makeScoped([
      { brand: 'Adidas', colors: [], sizes: [], attributes: {}, category_ids: [], effective_price: '100', base_price: '120', on_sale: false, availability: 'in_stock' },
      { brand: 'Adidas', colors: [], sizes: [], attributes: {}, category_ids: [], effective_price: '100', base_price: '120', on_sale: false, availability: 'in_stock' },
      { brand: 'Nike', colors: [], sizes: [], attributes: {}, category_ids: [], effective_price: '100', base_price: '120', on_sale: false, availability: 'in_stock' },
    ]);

    const blocks = await service.build([facet({})], { terms: new Map(), inStockOnly: false, onSaleOnly: false }, scoped);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].values).toEqual([
      { value: 'Adidas', label: 'Adidas', count: 2 },
      { value: 'Nike', label: 'Nike', count: 1 },
    ]);
  });

  it('should aggregate attribute facet values from the index attributes map', async () => {
    const scoped = makeScoped([
      { brand: null, colors: [], sizes: [], attributes: { gender: ['Men'] }, category_ids: [], effective_price: '100', base_price: '120', on_sale: false, availability: 'in_stock' },
      { brand: null, colors: [], sizes: [], attributes: { gender: ['Men', 'Unisex'] }, category_ids: [], effective_price: '100', base_price: '120', on_sale: false, availability: 'in_stock' },
    ]);

    const blocks = await service.build(
      [facet({ key: 'gender', label: 'Gender', source: FacetSource.ATTRIBUTE, sourceAttributeKey: 'gender' })],
      { terms: new Map(), inStockOnly: false, onSaleOnly: false },
      scoped,
    );

    const values = blocks[0].values ?? [];
    expect(values.find((v) => v.value === 'Men')?.count).toBe(2);
    expect(values.find((v) => v.value === 'Unisex')?.count).toBe(1);
  });

  it('should return price min/max bounds for a range facet', async () => {
    const scoped = makeScoped([
      { brand: null, colors: [], sizes: [], attributes: {}, category_ids: [], effective_price: '2500.00', base_price: '3000', on_sale: false, availability: 'in_stock' },
      { brand: null, colors: [], sizes: [], attributes: {}, category_ids: [], effective_price: '18000.00', base_price: '18000', on_sale: false, availability: 'in_stock' },
    ]);

    const blocks = await service.build(
      [facet({ key: 'price', label: 'Price', type: FacetType.RANGE, source: FacetSource.PRICE })],
      { terms: new Map(), inStockOnly: false, onSaleOnly: false },
      scoped,
    );

    expect(blocks[0]).toMatchObject({ key: 'price', type: 'range', min: '2500.00', max: '18000.00' });
  });

  it('should count a boolean on_sale facet', async () => {
    const scoped = makeScoped([
      { brand: null, colors: [], sizes: [], attributes: {}, category_ids: [], effective_price: '1', base_price: '2', on_sale: true, availability: 'in_stock' },
      { brand: null, colors: [], sizes: [], attributes: {}, category_ids: [], effective_price: '1', base_price: '2', on_sale: false, availability: 'in_stock' },
    ]);

    const blocks = await service.build(
      [facet({ key: 'on_sale', label: 'On Sale', type: FacetType.BOOLEAN, source: FacetSource.ATTRIBUTE })],
      { terms: new Map(), inStockOnly: false, onSaleOnly: false },
      scoped,
    );

    expect(blocks[0]).toMatchObject({ key: 'on_sale', type: 'boolean', count: 1 });
  });

  it('should omit an all-zero term facet when hide_zero_counts is set', async () => {
    const scoped = makeScoped([]); // no candidates → no brand values
    const blocks = await service.build(
      [facet({ hideZeroCounts: true })],
      { terms: new Map(), inStockOnly: false, onSaleOnly: false },
      scoped,
    );
    expect(blocks).toHaveLength(0);
  });
});
