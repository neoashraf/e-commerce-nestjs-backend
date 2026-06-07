import { ProductSearchDocumentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-search-document.orm-entity';

/** Storefront product card (contract: data.products[]). Money as 2-dp strings; currency always BDT. */
export interface ProductCard {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  primary_image: string | null;
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
    brand: doc.brand,
    primary_image: doc.primaryImage,
    effective_price: Number(doc.effectivePrice).toFixed(2),
    base_price: Number(doc.basePrice).toFixed(2),
    on_sale: doc.onSale,
    currency: 'BDT',
    availability: doc.availability,
  };
}
