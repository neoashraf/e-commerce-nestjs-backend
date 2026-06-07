/** Product kind (SRS 02 §8 Product.type). A `simple` product has one implicit SKU; a
 * `configurable` product varies on `is_configurable` attributes and owns generated variants. */
export enum ProductType {
  SIMPLE = 'simple',
  CONFIGURABLE = 'configurable',
}

/** Product lifecycle state (SRS 02 §8 Product.status, FR-CAT-014/015/016). */
export enum ProductStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

/** Typed product-link kinds (SRS 02 §8 ProductLink.type, FR-CAT-019). */
export enum ProductLinkType {
  RELATED = 'related',
  UP_SELL = 'up_sell',
  CROSS_SELL = 'cross_sell',
}

/** Product video source (SRS 02 §8 ProductVideo.source, FR-CAT-034). */
export enum ProductVideoSource {
  UPLOAD = 'upload',
  URL = 'url',
}
