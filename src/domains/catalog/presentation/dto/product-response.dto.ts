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
  @ApiProperty({ nullable: true, example: '12500.00', description: 'Effective sale price (struck base shown alongside)' })
  sale_price: string | null;
  @ApiProperty({ description: 'true only when now ∈ [sale_starts_at, sale_ends_at] (BR-CAT-4)' })
  sale_active: boolean;
  @ApiProperty() status: string;
  @ApiProperty({ nullable: true }) primary_category: string | null;
  @ApiProperty({ nullable: true, description: 'Live on-hand from INV; null when unavailable' })
  qty: number | null;
  @ApiProperty({
    nullable: true,
    enum: ['in_stock', 'low_stock', 'out_of_stock'],
    description: 'Derived live from INV (FR-CAT-042); null when unavailable',
  })
  qty_status: 'in_stock' | 'low_stock' | 'out_of_stock' | null;
}

/** One per-item outcome of a bulk publish/archive (FR-CAT-015/016). */
export class BulkStatusItemDto {
  @ApiProperty({ example: 'c7-uuid' }) id: string;
  @ApiProperty({ example: true }) ok: boolean;
  @ApiProperty({ required: false, example: 'published', description: 'New status when ok' })
  status?: string;
  @ApiProperty({ required: false, example: 'NOT_PUBLISHABLE', description: 'Failure code when !ok' })
  code?: string;
  @ApiProperty({ required: false, type: [String], example: ['no_primary_image'] })
  details?: string[];
}

/** Bulk publish/archive response — per-item results (FR-CAT-015/016). */
export class BulkStatusResponseDto {
  @ApiProperty({ example: 2 }) processed: number;
  @ApiProperty({ example: 1 }) succeeded: number;
  @ApiProperty({ example: 1 }) failed: number;
  @ApiProperty({ type: [BulkStatusItemDto] }) results: BulkStatusItemDto[];
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
  @ApiProperty({ nullable: true, description: 'Variant-specific image id (FR-CAT-023)' })
  image_id: string | null;
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
  @ApiProperty({ nullable: true, description: 'Tagged `color` attribute option (FR-CAT-032)' })
  color_option_id: string | null;
  @ApiProperty() is_primary: boolean;
  @ApiProperty() display_order: number;
}

/** One video in the admin editor (ordered after images). */
export class AdminProductVideoDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'url', description: 'url (external) | upload (stored file)' }) source: string;
  @ApiProperty({ example: 'https://…' }) url: string;
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
  @ApiProperty({ type: [AdminProductVideoDto] }) videos: AdminProductVideoDto[];
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

/** Delete-video response (FR-CAT-034). */
export class DeleteVideoResponseDto {
  @ApiProperty({ example: 'vd1-uuid' })
  id: string;
}

/** Image-reorder response — the persisted order (FR-CAT-031). */
export class ReorderImagesResponseDto {
  @ApiProperty({ type: [String], example: ['i3-uuid', 'i1-uuid', 'i2-uuid'] })
  ordered: string[];
}

/** Set-primary response — the now-primary image id (FR-CAT-032). */
export class SetPrimaryImageResponseDto {
  @ApiProperty({ example: 'i1-uuid' })
  id: string;

  @ApiProperty({ example: true })
  is_primary: boolean;
}

/** Image-delete response — the deleted id and the product's resulting primary (FR-CAT-032/033). */
export class DeleteImageResponseDto {
  @ApiProperty({ example: 'i1-uuid' })
  id: string;

  @ApiProperty({
    nullable: true,
    example: 'i2-uuid',
    description: 'New primary after deletion; null when no images remain',
  })
  primary_image_id: string | null;
}

/** Image metadata update response — alt text + colour-tag (FR-CAT-032). */
export class UpdateImageResponseDto {
  @ApiProperty({ example: 'i1-uuid' })
  id: string;

  @ApiProperty({ example: 'Brazil home jersey, front view' })
  alt_text: string;

  @ApiProperty({ nullable: true, example: 'o-yellow', description: 'Tagged colour option; null when untagged' })
  color_option_id: string | null;
}
