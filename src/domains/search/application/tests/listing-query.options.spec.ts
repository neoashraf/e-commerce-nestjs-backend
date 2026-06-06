import { parseListingOptions } from '../services/listing-query.options';
import { DEFAULT_LIMIT, MAX_LIMIT, SortKey } from '../../domain/search-enums';

describe('Search — parseListingOptions', () => {
  it('should default page=1, limit=24, and the given default sort', () => {
    const opts = parseListingOptions({}, SortKey.BEST_SELLING, false);
    expect(opts).toEqual({ page: 1, limit: DEFAULT_LIMIT, sort: SortKey.BEST_SELLING });
  });

  it('should cap limit at the maximum (60)', () => {
    expect(parseListingOptions({ limit: '500' }, SortKey.NEWEST, false).limit).toBe(MAX_LIMIT);
  });

  it('should ignore a malformed page/limit and fall back (FR-SRCH-051)', () => {
    const opts = parseListingOptions({ page: 'abc', limit: '-3' }, SortKey.NEWEST, false);
    expect(opts.page).toBe(1);
    expect(opts.limit).toBe(DEFAULT_LIMIT);
  });

  it('should honor a valid sort key', () => {
    expect(parseListingOptions({ sort: 'price_asc' }, SortKey.NEWEST, false).sort).toBe(SortKey.PRICE_ASC);
  });

  it('should reject relevance sort without a query, falling back to default (§11, BR-SRCH-5)', () => {
    expect(parseListingOptions({ sort: 'relevance' }, SortKey.BEST_SELLING, false).sort).toBe(
      SortKey.BEST_SELLING,
    );
  });

  it('should allow relevance sort when a query is present', () => {
    expect(parseListingOptions({ sort: 'relevance' }, SortKey.RELEVANCE, true).sort).toBe(
      SortKey.RELEVANCE,
    );
  });

  it('should ignore an unknown sort key', () => {
    expect(parseListingOptions({ sort: 'bogus' }, SortKey.NEWEST, true).sort).toBe(SortKey.NEWEST);
  });
});
