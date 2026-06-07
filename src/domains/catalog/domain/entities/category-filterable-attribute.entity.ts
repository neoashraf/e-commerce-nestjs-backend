/**
 * A filterable attribute chosen for a category's layered navigation (SRS 02 §8
 * CategoryFilterableAttribute, FR-CAT-009). Sources the per-category facet set that `SRCH`
 * surfaces (FR-CAT-054). Pure domain reference — carries the attribute `code` for read payloads.
 */
export class CategoryFilterableAttribute {
  constructor(
    public readonly attributeId: string,
    public readonly code: string,
    public readonly position: number,
  ) {}
}
