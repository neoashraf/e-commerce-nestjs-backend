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
