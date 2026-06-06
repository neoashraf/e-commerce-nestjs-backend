import { Injectable } from '@nestjs/common';

import {
  CartVariantView,
  ProductDetailService,
} from '../../../catalog/application/services/product-detail.service';

export type CartVariant = CartVariantView;

/**
 * Outbound port to CAT for the cart's variant read seam (FR-CART-004, BR-CAT-6). Resolves a variant to
 * its sellability, option values, thumbnail, and **live effective price** — the cart never persists
 * price. Real impl = catalog-variants-be / catalog-storefront-read-be (ProductDetailService.getCartVariant).
 */
export interface ICatalogReader {
  getVariant(variantId: string): Promise<CartVariant | null>;
}

export const CATALOG_READER = Symbol('ICatalogReader');

/** CAT-backed adapter: wraps `ProductDetailService.getCartVariant` (cart never touches CAT infra). */
@Injectable()
export class CatalogVariantReader implements ICatalogReader {
  constructor(private readonly detail: ProductDetailService) {}

  getVariant(variantId: string): Promise<CartVariant | null> {
    return this.detail.getCartVariant(variantId);
  }
}
