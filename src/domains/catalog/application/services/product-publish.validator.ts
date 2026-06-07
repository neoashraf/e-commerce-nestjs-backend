import { Injectable } from '@nestjs/common';

import { ProductType } from '../../domain/enums/product-type.enum';

/** A product's publish-readiness facts, gathered by the service for the validator. */
export interface PublishCandidate {
  type: ProductType;
  /** Whether the product has at least one image with a primary set. */
  hasPrimaryImage: boolean;
  /** Number of enabled, sellable variants (simple = its implicit SKU; configurable = real variants). */
  enabledVariantCount: number;
  /** Codes of the family's `is_required` attributes that currently have no value on the product. */
  missingRequiredAttributeCodes: string[];
}

/**
 * Publish-validation hook (FR-CAT-015, BR-CAT-7). Builds the `NOT_PUBLISHABLE.details[]` list a
 * `draft → published` transition must be empty of. The "≥1 enabled variant" rule is owned here for
 * the simple-product implicit SKU; for configurable products the count is fed by `catalog-variants-be`
 * (the variants service supplies `enabledVariantCount` via the product service's gather step), so this
 * validator stays the single source of the publish trinity regardless of product type.
 */
@Injectable()
export class ProductPublishValidator {
  /** Returns the machine-readable failure detail codes (empty ⇒ publishable). */
  validate(candidate: PublishCandidate): string[] {
    const details: string[] = [];

    if (!candidate.hasPrimaryImage) {
      details.push('no_primary_image');
    }
    if (candidate.enabledVariantCount < 1) {
      details.push('no_enabled_variant');
    }
    if (candidate.missingRequiredAttributeCodes.length > 0) {
      details.push(`missing_required_attributes:${candidate.missingRequiredAttributeCodes.join(',')}`);
    }

    return details;
  }
}
