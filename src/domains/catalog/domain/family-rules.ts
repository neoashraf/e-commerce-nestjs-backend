/**
 * Shared attribute-family invariants (SRS 02 §5.3 / §11, BR-CAT-13). Kept in the domain
 * layer so use cases and the seed enforce identical rules.
 */

/** `code`: 2–60 chars, lower snake_case `[a-z0-9_]`, immutable after creation (FR-CAT-061). */
export const FAMILY_CODE_PATTERN = /^[a-z0-9_]{2,60}$/;

export function isValidFamilyCode(code: string): boolean {
  return FAMILY_CODE_PATTERN.test(code);
}

/**
 * The mandatory system attributes every family must include; reorderable but never
 * removable from a family (FR-CAT-062).
 */
export const MANDATORY_SYSTEM_ATTRIBUTE_CODES: readonly string[] = [
  'sku',
  'name',
  'url_key',
  'price',
  'status',
  'description',
];
