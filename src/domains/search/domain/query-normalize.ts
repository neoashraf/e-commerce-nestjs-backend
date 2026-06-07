/**
 * Normalize a raw query for matching/logging/redirect lookup (SRS 03 §8 SearchQueryLog.normalized_text;
 * §11 query rules): trim, collapse internal whitespace, lowercase. Unicode-safe (Bangla preserved,
 * §12.10). Caps to the max query length before normalization is applied at the controller/DTO layer.
 */
export function normalizeQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}
