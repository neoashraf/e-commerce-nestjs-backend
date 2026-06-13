import { ProductSearchDocumentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-search-document.orm-entity';

/** A single colourway on the card swatch rail (RW6). */
export interface ProductCardSwatch {
  image: string;
  label: string;
  color_hex: string | null;
}

/** Light text merch label shown on the card (RW6). */
export type MerchLabel = 'new' | 'bestSeller' | 'authentic' | null;

/** Storefront product card (contract: data.products[]). Money as 2-dp strings; currency always BDT. */
export interface ProductCard {
  id: string;
  slug: string;
  title: string;
  /** Optional Bangla product name (RW6). */
  name_bn: string | null;
  brand: string | null;
  primary_image: string | null;
  /** Second listing image for the desktop hover cross-fade (RW6); null → ≤1.03 zoom fallback. */
  hover_image: string | null;
  /** Colourways flattened from the color attribute (RW6); [] → card omits the rail. */
  swatches: ProductCardSwatch[];
  /** true → "Choose size" (configurable); false → "Add to bag" (simple) (RW6). */
  requires_variant: boolean;
  /** new (from is_new) | bestSeller | authentic | null (RW6). */
  merch_label: MerchLabel;
  effective_price: string;
  base_price: string;
  on_sale: boolean;
  currency: 'BDT';
  availability: string;
}

/** Map an index document row to the contract product card. */
export function toProductCard(doc: ProductSearchDocumentOrmEntity): ProductCard {
  return {
    id: doc.productId,
    slug: doc.slug,
    title: doc.title,
    name_bn: doc.nameBn ?? null,
    brand: doc.brand,
    primary_image: doc.primaryImage,
    hover_image: doc.hoverImage ?? null,
    swatches: doc.swatches ?? [],
    requires_variant: doc.requiresVariant ?? false,
    merch_label: doc.merchLabel ?? null,
    effective_price: Number(doc.effectivePrice).toFixed(2),
    base_price: Number(doc.basePrice).toFixed(2),
    on_sale: doc.onSale,
    currency: 'BDT',
    availability: doc.availability,
  };
}
