/**
 * Shared category invariants (SRS 02 §5.1 / §6 / §11, BR-CAT-1/3). Kept in the domain layer
 * so the use cases enforce identical rules independent of the transport/ORM layers.
 */

/** Category tree depth is capped at 3 levels (BR-CAT-1, FR-CAT-003). */
export const MAX_CATEGORY_DEPTH = 3;

/** Category name: 2–120 chars (SRS 02 §11). */
export const CATEGORY_NAME_MIN = 2;
export const CATEGORY_NAME_MAX = 120;

/**
 * Slugify a category name into a URL-safe slug (FR-CAT-002): lowercase, ASCII alphanumerics
 * kept, every other run collapsed to a single hyphen, edges trimmed. Non-ASCII (e.g. Bangla)
 * characters carry no ASCII transliteration, so a name with no ASCII alphanumerics falls back
 * to `category` — the numeric collision suffix (applied by the use case) keeps it unique.
 */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'category';
}

/** The level a category would occupy given its parent's level (top level = 1). */
export function levelForParent(parentLevel: number | null): number {
  return parentLevel === null ? 1 : parentLevel + 1;
}

/** Whether a category at `level` whose subtree extends `relativeDepth` below it fits the cap. */
export function fitsDepth(level: number, relativeDepth: number): boolean {
  return level + relativeDepth <= MAX_CATEGORY_DEPTH;
}
