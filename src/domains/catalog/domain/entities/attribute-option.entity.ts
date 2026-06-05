import { SwatchType } from '../enums/swatch-type.enum';

/**
 * A selectable value of a `select` / `multiselect` attribute (SRS 02 §8 AttributeOption,
 * FR-CAT-051). Pure domain entity — no ORM/Nest decorators.
 */
export class AttributeOption {
  constructor(
    public readonly id: string,
    public value: string,
    public label: string,
    public swatchType: SwatchType | null,
    public swatchValue: string | null,
    public position: number,
  ) {}
}
