/**
 * Attribute-family aggregate of the Catalog EAV model (SRS 02 §5.3, §8). A family is a
 * per-product-type template (e.g. *Mens Footwear*) that groups existing attributes into
 * ordered {@link AttributeGroup}s, each holding ordered {@link FamilyAttributeRef}s.
 * Pure domain entities — no ORM/Nest imports.
 */

/** One attribute placed in a group, carrying the registry fields the editor renders. */
export class FamilyAttributeRef {
  constructor(
    public readonly id: string,
    public readonly attributeId: string,
    public readonly code: string,
    public readonly adminLabel: string,
    public readonly type: string,
    public readonly position: number,
  ) {}
}

/** An ordered group of attributes within a family, laid out in an editor column (1 | 2). */
export class AttributeGroup {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly column: number,
    public readonly position: number,
    public readonly attributes: FamilyAttributeRef[],
  ) {}
}

/** The family template chosen at product creation; `code` is stable/immutable (FR-CAT-061). */
export class AttributeFamily {
  constructor(
    public readonly id: string,
    public readonly code: string,
    public name: string,
    public readonly isDefault: boolean,
    public readonly groups: AttributeGroup[],
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  /** The seeded Default family is not deletable (BR-CAT-13, FR-CAT-063). */
  get isDeletable(): boolean {
    return !this.isDefault;
  }
}
