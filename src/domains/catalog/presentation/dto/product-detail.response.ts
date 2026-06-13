import { ApiProperty } from '@nestjs/swagger';

/** A configurable-attribute option as rendered on the PDP (with swatch). */
export class PdpOptionDto {
  @ApiProperty() id: string;
  @ApiProperty() value: string;
  @ApiProperty({ nullable: true }) swatch_type: string | null;
  @ApiProperty({ nullable: true }) swatch_value: string | null;
}

export class PdpConfigurableAttributeDto {
  @ApiProperty() code: string;
  @ApiProperty() label: string;
  @ApiProperty({ type: [PdpOptionDto] }) options: PdpOptionDto[];
}

export class PdpImageDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: { detail: '…', thumb: '…' } }) renditions: Record<string, string>;
  @ApiProperty() alt_text: string;
  @ApiProperty({ nullable: true }) color_option_id: string | null;
  @ApiProperty() is_primary: boolean;
}

export class PdpVideoDto {
  @ApiProperty() id: string;
  @ApiProperty() source: string;
  @ApiProperty() url: string;
}

export class PdpVariantDto {
  @ApiProperty() id: string;
  @ApiProperty() sku_code: string;
  @ApiProperty({ example: { color: 'o-black', size: 'o-42' } }) options: Record<string, string>;
  @ApiProperty({ example: '12500.00' }) price: string;
  @ApiProperty({ example: 'in_stock' }) stock_status: string;
}

export class PdpSpecDto {
  @ApiProperty() code: string;
  @ApiProperty() label: string;
  @ApiProperty({ description: 'Scalar value or array of labels (multiselect)' })
  value: string | string[];
}

/** A single colourway on a link/related card's swatch rail (RW6). */
export class PdpCardSwatchDto {
  @ApiProperty({ example: 'https://…/black-thumb.webp' }) image: string;
  @ApiProperty({ example: 'Black' }) label: string;
  @ApiProperty({ nullable: true, example: '#000000' }) color_hex: string | null;
}

export class PdpLinkCardDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true, description: 'Optional Bangla product name (RW6).' })
  name_bn: string | null;
  @ApiProperty({ nullable: true }) primary_image: string | null;
  @ApiProperty({ nullable: true, description: 'Hover cross-fade image (RW6); null → zoom fallback.' })
  hover_image: string | null;
  @ApiProperty({ type: [PdpCardSwatchDto], description: 'Colourways (≤6); [] → no rail (RW6).' })
  swatches: PdpCardSwatchDto[];
  @ApiProperty({ description: 'true → "Choose size" (configurable); false → "Add to bag" (RW6).' })
  requires_variant: boolean;
  @ApiProperty({ nullable: true, enum: ['new', 'bestSeller', 'authentic'], description: 'Merch label (RW6).' })
  merch_label: 'new' | 'bestSeller' | 'authentic' | null;
  @ApiProperty({ example: '9800.00' }) effective_price: string;
  @ApiProperty({ example: '9800.00' }) base_price: string;
  @ApiProperty() on_sale: boolean;
}

export class PdpLinksDto {
  @ApiProperty({ type: [PdpLinkCardDto] }) related: PdpLinkCardDto[];
  @ApiProperty({ type: [PdpLinkCardDto] }) up_sell: PdpLinkCardDto[];
  @ApiProperty({ type: [PdpLinkCardDto] }) cross_sell: PdpLinkCardDto[];
}

/** The full storefront PDP payload (contract: Storefront → GET — Product detail, FR-CAT-041). */
export class ProductDetailResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() type: string;
  @ApiProperty({ nullable: true }) family: string | null;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true, description: 'Optional Bangla product name (RW6).' })
  name_bn: string | null;
  @ApiProperty() slug: string;
  @ApiProperty({ nullable: true }) brand: string | null;
  @ApiProperty({ type: [String] }) breadcrumb: string[];
  @ApiProperty({ nullable: true }) short_description: string | null;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty({ example: '12500.00' }) effective_price: string;
  @ApiProperty({ example: '14000.00' }) base_price: string;
  @ApiProperty({ example: 'BDT' }) currency: string;
  @ApiProperty() sale_active: boolean;
  @ApiProperty() is_new: boolean;
  @ApiProperty() is_featured: boolean;
  @ApiProperty({ type: [PdpImageDto] }) images: PdpImageDto[];
  @ApiProperty({ type: [PdpVideoDto] }) videos: PdpVideoDto[];
  @ApiProperty({ type: [PdpConfigurableAttributeDto] })
  configurable_attributes: PdpConfigurableAttributeDto[];
  @ApiProperty({ type: [PdpVariantDto] }) variants: PdpVariantDto[];
  @ApiProperty({ type: [PdpSpecDto] }) specs: PdpSpecDto[];
  @ApiProperty({ type: PdpLinksDto }) links: PdpLinksDto;
}
