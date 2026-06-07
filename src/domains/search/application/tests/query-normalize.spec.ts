import { normalizeQuery } from '../../domain/query-normalize';

describe('Search — normalizeQuery', () => {
  it('should trim, collapse whitespace, and lowercase', () => {
    expect(normalizeQuery('  Adidas   Predator  ')).toBe('adidas predator');
  });

  it('should preserve Bangla/Unicode characters (§12.10)', () => {
    expect(normalizeQuery('  বুট  ')).toBe('বুট');
  });

  it('should return empty for whitespace-only input', () => {
    expect(normalizeQuery('   ')).toBe('');
  });
});
