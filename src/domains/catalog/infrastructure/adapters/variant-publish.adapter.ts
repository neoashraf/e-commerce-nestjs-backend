import { Injectable } from '@nestjs/common';

import { IProductVariantPublishPort } from '../../application/ports/product-variant-publish.port';
import { VariantsService } from '../../application/services/variants.service';

/**
 * Real variant publish-count port (replaces VariantPublishStubAdapter once catalog-variants-be
 * lands). Backs products-be's `no_enabled_variant` publish check (FR-CAT-025, BR-CAT-7) with the
 * actual enabled-variant count for configurable products.
 */
@Injectable()
export class VariantPublishAdapter implements IProductVariantPublishPort {
  constructor(private readonly variants: VariantsService) {}

  countEnabledVariants(productId: string): Promise<number> {
    return this.variants.countEnabledVariants(productId);
  }
}
