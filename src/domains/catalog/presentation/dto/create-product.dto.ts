import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import { ProductType } from '../../domain/enums/product-type.enum';

/** Money string (e.g. "14000.00") — kept as a string to avoid float drift; range checked in the service. */
const MONEY_REGEX = /^\d{1,10}(\.\d{1,2})?$/;

/**
 * Create-product request (FR-CAT-010/011/012/013/018). Field names are snake_case per the API
 * contract. `attributes` is a map of attribute-code → value (string | string[] | boolean | number),
 * validated against the product's family via the attribute-assignment validator.
 */
export class CreateProductDto {
  @ApiProperty({ enum: ProductType, example: ProductType.CONFIGURABLE })
  @IsEnum(ProductType)
  type: ProductType;

  @ApiProperty({ example: 'fam-uuid', description: 'Attribute family UUID (immutable after create)' })
  @IsUUID()
  family_id: string;

  @ApiProperty({ example: 'PRED-ELITE', maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sku: string;

  @ApiProperty({ example: 'Adidas Predator Elite', maxLength: 180 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  name: string;

  @ApiProperty({ example: 'a2b-uuid', description: 'Primary owning category UUID' })
  @IsUUID()
  primary_category_id: string;

  @ApiPropertyOptional({ type: [String], description: 'Additional browsing category UUIDs' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  category_ids?: string[];

  @ApiPropertyOptional({ example: 'Adidas', maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  brand?: string;

  @ApiPropertyOptional({ example: 'Lightweight elite football boot.' })
  @IsOptional()
  @IsString()
  short_description?: string;

  @ApiPropertyOptional({ example: 'Full rich description…' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '14000.00', description: 'Base price in BDT' })
  @IsString()
  @Matches(MONEY_REGEX, { message: 'base_price must be a money value like "14000.00"' })
  base_price: string;

  @ApiPropertyOptional({ example: '12500.00', description: 'Sale price (requires both sale dates)' })
  @IsOptional()
  @IsString()
  @Matches(MONEY_REGEX, { message: 'sale_price must be a money value like "12500.00"' })
  sale_price?: string;

  @ApiPropertyOptional({ example: '2026-06-05T00:00:00Z' })
  @IsOptional()
  @IsString()
  sale_starts_at?: string;

  @ApiPropertyOptional({ example: '2026-06-20T00:00:00Z' })
  @IsOptional()
  @IsString()
  sale_ends_at?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  is_featured?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_new?: boolean;

  @ApiPropertyOptional({ example: '0.480', description: 'Shipping weight in kg' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,5}(\.\d{1,3})?$/, { message: 'weight must be a number like "0.480"' })
  weight?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { gender: 'men', surface_type: ['fg'], material: 'synthetic' },
    description: 'Attribute-code → value map (validated against the family)',
  })
  @IsOptional()
  @IsObject()
  @Type(() => Object)
  attributes?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'Adidas Predator Elite', maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  meta_title?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  meta_keywords?: string;

  @ApiPropertyOptional({ maxLength: 320 })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  meta_description?: string;
}
