/**
 * The typed attribute kinds a Catalog Manager may create (SRS 02 §5.2 FR-CAT-050, §8 Attribute.type).
 * `select` / `multiselect` own an option set; only `select` may be `is_configurable` (BR-CAT-11).
 */
export enum AttributeType {
  TEXT = 'text',
  TEXTAREA = 'textarea',
  RICH_TEXT = 'rich_text',
  INTEGER = 'integer',
  DECIMAL = 'decimal',
  PRICE = 'price',
  BOOLEAN = 'boolean',
  SELECT = 'select',
  MULTISELECT = 'multiselect',
  DATE = 'date',
  DATETIME = 'datetime',
  IMAGE = 'image',
  FILE = 'file',
}

/** Types that carry an `AttributeOption` set (FR-CAT-051). */
export const OPTION_BEARING_TYPES: readonly AttributeType[] = [
  AttributeType.SELECT,
  AttributeType.MULTISELECT,
];

/** Whether a type owns an option set. */
export function isOptionBearing(type: AttributeType): boolean {
  return OPTION_BEARING_TYPES.includes(type);
}
