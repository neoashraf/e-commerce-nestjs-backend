/**
 * The three single-image slots a category stores (FR-CAT-001 thumbnail, FR-CAT-010a logo/banner).
 * Each maps to one URL column on `categories` (`image_url` / `logo_url` / `banner_url`).
 */
export enum CategoryImageSlot {
  THUMBNAIL = 'thumbnail',
  LOGO = 'logo',
  BANNER = 'banner',
}
