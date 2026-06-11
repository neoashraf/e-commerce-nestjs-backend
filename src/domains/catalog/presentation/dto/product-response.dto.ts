import { ApiProperty } from '@nestjs/swagger';

/** Create-product response payload (`{ data }` envelope added by the interceptor). */
export class CreateProductResponseDto {
  @ApiProperty({ example: 'c7-uuid' })
  id: string;

  @ApiProperty({ example: 'adidas-predator-elite' })
  slug: string;

  @ApiProperty({ example: 'configurable' })
  type: string;

  @ApiProperty({ example: 'draft' })
  status: string;
}

/** Update-product response payload. */
export class UpdateProductResponseDto {
  @ApiProperty({ example: 'c7-uuid' })
  id: string;
}

/** PUT links response — per-type counts. */
export class SetProductLinksResponseDto {
  @ApiProperty({ example: 2 })
  related: number;

  @ApiProperty({ example: 1 })
  up_sell: number;

  @ApiProperty({ example: 1 })
  cross_sell: number;
}

/** Status-transition response. */
export class UpdateStatusResponseDto {
  @ApiProperty({ example: 'c7-uuid' })
  id: string;

  @ApiProperty({ example: 'published' })
  status: string;
}

/** One row of the admin product list (`qty` is joined live from INV; null when unavailable). */
export class AdminProductRowDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() sku: string;
  @ApiProperty() type: string;
  @ApiProperty({ nullable: true }) family: string | null;
  @ApiProperty({ nullable: true }) primary_image: string | null;
  @ApiProperty({ example: '14000.00' }) base_price: string;
  @ApiProperty() status: string;
  @ApiProperty({ nullable: true }) primary_category: string | null;
  @ApiProperty({ nullable: true, description: 'Live on-hand from INV; null when unavailable' })
  qty: number | null;
}

/** Full product detail for the admin editor — `GET /admin/products/{id}` (includes `updated_at`). */
/** One variant row in the admin editor matrix (with live INV stock). */
export class AdminProductVariantDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'BOOT-BLACK-42' }) sku_code: string;
  @ApiProperty({ example: { color: 'Black', size: '42' }, description: 'Attribute code → option label' })
  options: Record<string, string>;
  @ApiProperty({ nullable: true, example: '9500.00', description: 'Per-variant price override' })
  price: string | null;
  @ApiProperty() is_enabled: boolean;
  @ApiProperty({ example: 50, description: 'Live on-hand stock from INV' }) on_hand: number;
  @ApiProperty({ example: 5 }) low_stock_threshold: number;
}

/** One image in the admin editor gallery. */
export class AdminProductImageDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'http://localhost:8000/media/products/…/123-boot.jpg' }) url: string;
  @ApiProperty({ example: { thumb: '…', listing: '…', detail: '…' } })
  renditions: Record<string, string>;
  @ApiProperty() alt_text: string;
  @ApiProperty() is_primary: boolean;
  @ApiProperty() display_order: number;
}

export class AdminProductDetailDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'configurable' }) type: string;
  @ApiProperty() family_id: string;
  @ApiProperty({ nullable: true }) family_code: string | null;
  @ApiProperty() sku: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiProperty({ example: 'draft' }) status: string;
  @ApiProperty({ nullable: true }) brand: string | null;
  @ApiProperty({ nullable: true }) short_description: string | null;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty({ example: '14000.00' }) base_price: string;
  @ApiProperty({ nullable: true, example: '12500.00' }) sale_price: string | null;
  @ApiProperty({ nullable: true }) sale_starts_at: string | null;
  @ApiProperty({ nullable: true }) sale_ends_at: string | null;
  @ApiProperty() is_featured: boolean;
  @ApiProperty() is_new: boolean;
  @ApiProperty({ nullable: true }) weight: string | null;
  @ApiProperty() primary_category_id: string;
  @ApiProperty({ type: [String] }) category_ids: string[];
  @ApiProperty({ nullable: true }) primary_image_id: string | null;
  @ApiProperty({ type: [AdminProductImageDto] }) images: AdminProductImageDto[];
  @ApiProperty({ type: [AdminProductVariantDto] }) variants: AdminProductVariantDto[];
  @ApiProperty({ nullable: true }) meta_title: string | null;
  @ApiProperty({ nullable: true }) meta_keywords: string | null;
  @ApiProperty({ nullable: true }) meta_description: string | null;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Attribute code → value (value[] for multiselect)',
  })
  attributes: Record<string, unknown>;
  @ApiProperty() created_at: string;
  @ApiProperty({ description: 'Send this back on PATCH for optimistic concurrency' }) updated_at: string;
}

/** Image-upload response. */
export class UploadImageResponseDto {
  @ApiProperty({ example: 'i1-uuid' })
  id: string;

  @ApiProperty({
    example: { thumb: '…', listing: '…', detail: '…' },
    description: 'Rendition URLs (original-URL fallback until async generation completes)',
  })
  renditions: Record<string, string>;
}

/** Add-video response. */
export class AddVideoResponseDto {
  @ApiProperty({ example: 'vd1-uuid' })
  id: string;
}
