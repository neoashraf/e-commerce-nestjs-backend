import { Injectable, Logger } from '@nestjs/common';

/** A replacement variant's current value + snapshot, read from CAT (FR-ORD-048). */
export interface ReplacementVariant {
  productId: string;
  variantId: string;
  productTitle: string;
  skuCode: string;
  variantOptions: Record<string, string>;
  /** Effective unit price now (Decimal string) — compared against the original item value. */
  unitPrice: string;
  /** Whether the variant is currently sellable (in stock) — issuance blocks when false. */
  inStock: boolean;
}

/**
 * Outbound port to CAT for replacement-variant value + exchangeability (FR-ORD-046/048). The real impl
 * reads the effective price + stock status from catalog-storefront-read and the non-exchangeable-category
 * configuration. The exchange engine compares the replacement's value to the original item (equal/higher
 * only) and checks the original item's category is exchangeable. Until wired in-process,
 * {@link StubExchangeCatalog} returns a deterministic exchangeable, in-stock variant.
 */
export interface IExchangeCatalog {
  /** Resolve a replacement variant's snapshot + value; `null` if the variant does not exist. */
  getReplacementVariant(variantId: string): Promise<ReplacementVariant | null>;
  /** Whether the original item's product/category is exchangeable (not innerwear/socks/accessories). */
  isExchangeable(productId: string): Promise<boolean>;
}

export const EXCHANGE_CATALOG = Symbol('IExchangeCatalog');

/** Default stub for the CAT seam until catalog-storefront-read is wired in-process. */
@Injectable()
export class StubExchangeCatalog implements IExchangeCatalog {
  private readonly logger = new Logger(StubExchangeCatalog.name);

  async getReplacementVariant(variantId: string): Promise<ReplacementVariant | null> {
    this.logger.log(`[stub] CAT replacement variant lookup ${variantId}`);
    return {
      productId: '00000000-0000-0000-0000-000000000000',
      variantId,
      productTitle: 'Replacement item',
      skuCode: 'REPLACEMENT',
      variantOptions: {},
      unitPrice: '0.00',
      inStock: true,
    };
  }

  async isExchangeable(productId: string): Promise<boolean> {
    this.logger.log(`[stub] CAT exchangeability check ${productId}`);
    return true;
  }
}
