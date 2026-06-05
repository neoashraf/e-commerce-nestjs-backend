import { Injectable } from '@nestjs/common';

import { IProductVariantPublishPort } from '../../application/ports/product-variant-publish.port';

/**
 * Temporary stub for the variant publish-count port. Until `catalog-variants-be` provides the real
 * implementation, a configurable product is treated as having 0 enabled variants — so publishing one
 * fails with `no_enabled_variant`, which is the correct pre-variants behaviour. Replaced (not removed)
 * when the variants slice binds the port to its real count.
 */
@Injectable()
export class VariantPublishStubAdapter implements IProductVariantPublishPort {
  async countEnabledVariants(): Promise<number> {
    return 0;
  }
}
