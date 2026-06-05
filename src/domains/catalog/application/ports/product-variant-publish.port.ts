/**
 * Port the products publish-validation reads to count a configurable product's enabled, sellable
 * variants (FR-CAT-025, BR-CAT-7). Owned by `catalog-variants-be` once it lands; until then the
 * stub returns 0 (a configurable product with no variants is not publishable — `no_enabled_variant`).
 * Simple products bypass this (their implicit SKU is always counted as 1).
 */
export interface IProductVariantPublishPort {
  countEnabledVariants(productId: string): Promise<number>;
}

export const PRODUCT_VARIANT_PUBLISH_PORT = Symbol('IProductVariantPublishPort');
