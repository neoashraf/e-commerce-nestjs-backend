import { AttributeType, isOptionBearing } from '../enums/attribute-type.enum';
import { AttributeOption } from './attribute-option.entity';

/**
 * Foundation of the Catalog EAV model: a typed, reusable definition of a single product
 * property identified by a stable `code` (SRS 02 §4, §8 Attribute, FR-CAT-050/057/058/059).
 * Pure domain entity — business invariants live here, no ORM/Nest imports.
 */
export class Attribute {
  constructor(
    public readonly id: string,
    public readonly code: string,
    public adminLabel: string,
    public type: AttributeType,
    public isRequired: boolean,
    public isUnique: boolean,
    public isFilterable: boolean,
    public isConfigurable: boolean,
    public isVisibleOnFront: boolean,
    public isComparable: boolean,
    public readonly isUserDefined: boolean,
    public validation: string | null,
    public defaultValue: string | null,
    public position: number,
    public isActive: boolean,
    public options: AttributeOption[],
    public readonly createdAt: Date,
    public updatedAt: Date,
  ) {}

  /** Whether this attribute carries an option set (`select` / `multiselect`). */
  get isOptionBearing(): boolean {
    return isOptionBearing(this.type);
  }

  /** Seeded system attributes (`is_user_defined = false`) are not deletable (BR-CAT-13, FR-CAT-059). */
  get isDeletable(): boolean {
    return this.isUserDefined;
  }
}
