/** A category's storefront display mode (SRS 02 §8 Category.display_mode, FR-CAT-010a). */
export enum DisplayMode {
  PRODUCTS_AND_DESCRIPTION = 'products_and_description',
  PRODUCTS_ONLY = 'products_only',
  DESCRIPTION_ONLY = 'description_only',
}

export const DISPLAY_MODES: readonly DisplayMode[] = Object.values(DisplayMode);

export function isDisplayMode(value: string): value is DisplayMode {
  return (DISPLAY_MODES as readonly string[]).includes(value);
}
