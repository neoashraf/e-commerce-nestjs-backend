import { ApiProperty } from '@nestjs/swagger';

/** Live product card for a wishlist item (BR-WISH-2). */
export class WishlistProductDto {
  @ApiProperty({ example: 'c7a1e2f0-0000-4000-8000-000000000001' })
  id: string;

  @ApiProperty({ example: 'adidas-predator-elite' })
  slug: string;

  @ApiProperty({ example: 'Adidas Predator Elite' })
  title: string;

  @ApiProperty({ example: 'অ্যাডিডাস প্রিডেটর এলিট', nullable: true, description: 'Optional Bangla product name (RW6).' })
  name_bn: string | null;

  @ApiProperty({ example: 'Adidas', nullable: true })
  brand: string | null;

  @ApiProperty({ example: 'https://cdn/listing.webp', nullable: true })
  primary_image: string | null;

  @ApiProperty({ example: 'https://cdn/listing-2.webp', nullable: true, description: 'Hover cross-fade image (RW6); null → zoom fallback.' })
  hover_image: string | null;

  @ApiProperty({
    type: 'array',
    description: 'Colourways flattened from the color attribute (≤6); [] → no rail (RW6).',
    items: {
      type: 'object',
      properties: {
        image: { type: 'string' },
        label: { type: 'string' },
        color_hex: { type: 'string', nullable: true },
      },
    },
    example: [{ image: 'https://cdn/black.webp', label: 'Black', color_hex: '#000000' }],
  })
  swatches: { image: string; label: string; color_hex: string | null }[];

  @ApiProperty({ example: true, description: 'true → "Choose size" (configurable); false → "Add to bag" (RW6).' })
  requires_variant: boolean;

  @ApiProperty({ nullable: true, enum: ['new', 'bestSeller', 'authentic'], example: 'new', description: 'Merch label; new from is_new (RW6).' })
  merch_label: 'new' | 'bestSeller' | 'authentic' | null;

  @ApiProperty({ example: '12500.00' })
  effective_price: string;

  @ApiProperty({ example: '14000.00' })
  base_price: string;

  @ApiProperty({ example: true })
  on_sale: boolean;

  @ApiProperty({ example: 'BDT' })
  currency: 'BDT';
}

/** Preferred variant label for a wishlist item (null when none/unresolved). */
export class WishlistPreferredVariantDto {
  @ApiProperty({ example: 'v1a1e2f0-0000-4000-8000-000000000002' })
  id: string;

  @ApiProperty({ example: 'PRED-BLK-42' })
  sku_code: string;

  @ApiProperty({ example: { color: 'Black', size: '42' }, type: 'object', additionalProperties: { type: 'string' } })
  options: Record<string, string>;
}

/** A single wishlist item row (FR-WISH-010–013). */
export class WishlistItemResponseDto {
  @ApiProperty({ example: 'wi_1' })
  item_id: string;

  @ApiProperty({ type: WishlistProductDto })
  product: WishlistProductDto;

  @ApiProperty({ type: WishlistPreferredVariantDto, nullable: true })
  preferred_variant: WishlistPreferredVariantDto | null;

  @ApiProperty({ example: 'in_stock', enum: ['in_stock', 'out_of_stock', 'unavailable'] })
  availability: 'in_stock' | 'out_of_stock' | 'unavailable';

  @ApiProperty({ example: true })
  is_available: boolean;

  @ApiProperty({ example: '2026-06-02T14:20:00.000Z' })
  added_at: string;
}

class WishlistListMetaDto {
  @ApiProperty({ example: 2 })
  total: number;

  @ApiProperty({ example: 100 })
  max_items: number;
}

/** `GET /me/wishlist` envelope: `{ data: [...], meta: { total, max_items } }`. */
export class WishlistListResponseDto {
  @ApiProperty({ type: [WishlistItemResponseDto] })
  data: WishlistItemResponseDto[];

  @ApiProperty({ type: WishlistListMetaDto })
  meta: WishlistListMetaDto;
}

export class AddItemResultDto {
  @ApiProperty({ example: 'wi_1' })
  item_id: string;

  @ApiProperty({ example: false, description: '`true` (with 200) when the item was already present' })
  already_present: boolean;
}

export class MoveToCartResultDto {
  @ApiProperty({ example: 'ci_5' })
  cart_item_id: string;

  @ApiProperty({ example: true })
  moved: boolean;

  @ApiProperty({ example: true })
  kept_in_wishlist: boolean;
}

export class MergeResultDto {
  @ApiProperty({ example: 1 })
  merged_count: number;

  @ApiProperty({ example: 1 })
  skipped_duplicates: number;

  @ApiProperty({ example: 1 })
  dropped_unpublished: number;

  @ApiProperty({ example: 0 })
  skipped_over_cap: number;

  @ApiProperty({ example: 2 })
  total: number;
}

export class MembershipResultDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'boolean' },
    example: { 'c7a1e2f0-0000-4000-8000-000000000001': true, 'c9a1e2f0-0000-4000-8000-000000000003': false },
  })
  data: Record<string, boolean>;
}
