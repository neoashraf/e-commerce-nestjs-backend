import { Injectable } from '@nestjs/common';

import {
  CartVariantView,
  ProductDetailService,
  WishlistProductCard,
} from '../../../catalog/application/services/product-detail.service';

export type WishlistVariant = CartVariantView;
export type { WishlistProductCard };

/**
 * Outbound port to CAT for the wishlist read seam (BR-WISH-2). Resolves saved product references to
 * **live** card data (price/on-sale/published state + enabled variant ids for product-level stock) and
 * resolves a preferred variant to its sellability + option values. WISH stores references only; all
 * price/availability is read here at view time, never cached. Real impl = catalog-storefront-read-be.
 */
export interface ICatalogReader {
  /** Batch-resolve product cards (incl. archived/soft-deleted, flagged `available:false`). */
  getProductCards(productIds: string[]): Promise<Map<string, WishlistProductCard>>;
  /** Resolve a single variant (sku/options/sellability/product link); null when it doesn't exist. */
  getVariant(variantId: string): Promise<WishlistVariant | null>;
}

export const CATALOG_READER = Symbol('WishlistICatalogReader');

/** CAT-backed adapter: wraps `ProductDetailService` (WISH never touches CAT infra). */
@Injectable()
export class CatalogWishlistReader implements ICatalogReader {
  constructor(private readonly detail: ProductDetailService) {}

  getProductCards(productIds: string[]): Promise<Map<string, WishlistProductCard>> {
    return this.detail.getWishlistProductCards(productIds);
  }

  getVariant(variantId: string): Promise<WishlistVariant | null> {
    return this.detail.getCartVariant(variantId);
  }
}
