import { FacetFilterService } from '../services/facet-filter.service';
import { FacetSource, FacetType } from '../../domain/search-enums';
import { ResolvedFacet } from '../services/facet.types';

const facet = (key: string, source: FacetSource): ResolvedFacet => ({
  key,
  label: key,
  type: FacetType.TERM,
  source,
  sourceAttributeKey: source === FacetSource.ATTRIBUTE ? key : null,
  isMultiSelect: true,
  hideZeroCounts: true,
  displayOrder: 0,
});

describe('Search — FacetFilterService.parse', () => {
  let service: FacetFilterService;
  const applicable = [
    facet('brand', FacetSource.BRAND),
    facet('color', FacetSource.VARIANT_COLOR),
    facet('gender', FacetSource.ATTRIBUTE),
  ];

  beforeEach(() => {
    service = new FacetFilterService();
  });

  it('should parse multi-value term selections and dedupe', () => {
    const filters = service.parse({ color: ['black', 'black', 'white'], brand: 'Adidas' }, applicable);
    expect(filters.terms.get('color')).toEqual(['black', 'white']);
    expect(filters.terms.get('brand')).toEqual(['Adidas']);
  });

  it('should ignore unknown facet keys (FR-SRCH-051)', () => {
    const filters = service.parse({ unknown_key: 'x', color: 'black' }, applicable);
    expect(filters.terms.has('unknown_key')).toBe(false);
    expect(filters.terms.get('color')).toEqual(['black']);
  });

  it('should parse a valid price range', () => {
    const filters = service.parse({ price_min: '2000', price_max: '10000' }, applicable);
    expect(filters.priceMin).toBe(2000);
    expect(filters.priceMax).toBe(10000);
  });

  it('should ignore an inverted price range (min > max) (§11)', () => {
    const filters = service.parse({ price_min: '10000', price_max: '2000' }, applicable);
    expect(filters.priceMin).toBeUndefined();
    expect(filters.priceMax).toBeUndefined();
  });

  it('should parse boolean in_stock / on_sale toggles', () => {
    const filters = service.parse({ in_stock: 'true', on_sale: '1' }, applicable);
    expect(filters.inStockOnly).toBe(true);
    expect(filters.onSaleOnly).toBe(true);
  });

  it('should not treat reserved params (page/limit/sort/q) as facets', () => {
    const filters = service.parse({ page: '2', limit: '24', sort: 'newest', q: 'pred' }, applicable);
    expect(filters.terms.size).toBe(0);
  });
});
