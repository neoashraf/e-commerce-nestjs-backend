import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

enum LinkTypeDto {
  CATEGORY = 'category',
  PRODUCT = 'product',
  PAGE = 'page',
  URL = 'url',
}
enum SectionTypeDto {
  FEATURED_CATEGORIES = 'featured_categories',
  FEATURED_PRODUCTS = 'featured_products',
}

// --- Slides ---

export class CreateSlideDto {
  @ApiProperty({ example: 'https://cdn/hero.webp', maxLength: 500 })
  @IsString() @IsNotEmpty() @MaxLength(500)
  image_url: string;

  @ApiProperty({ example: 'Eid boot sale', maxLength: 160 })
  @IsString() @IsNotEmpty() @MaxLength(160)
  alt_text: string;

  @ApiPropertyOptional({ example: 'Eid Football Sale', maxLength: 120 })
  @IsOptional() @IsString() @MaxLength(120)
  headline?: string;

  @ApiPropertyOptional({ example: 'Up to 30% off', maxLength: 200 })
  @IsOptional() @IsString() @MaxLength(200)
  subtext?: string;

  @ApiPropertyOptional({ example: 'Shop Boots', maxLength: 40 })
  @IsOptional() @IsString() @MaxLength(40)
  cta_label?: string;

  @ApiProperty({ enum: LinkTypeDto, example: LinkTypeDto.CATEGORY })
  @IsEnum(LinkTypeDto)
  link_type: LinkTypeDto;

  @ApiProperty({ example: 'football-boots', maxLength: 255 })
  @IsString() @IsNotEmpty() @MaxLength(255)
  link_ref: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @IsInt() @Min(0)
  display_order?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional() @IsBoolean()
  is_published?: boolean;

  @ApiPropertyOptional({ example: '2026-06-05T00:00:00Z' })
  @IsOptional() @IsString()
  starts_at?: string;

  @ApiPropertyOptional({ example: '2026-06-20T23:59:59Z' })
  @IsOptional() @IsString()
  ends_at?: string;
}

export class UpdateSlideDto extends CreateSlideDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) override image_url: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) override alt_text: string;
  @ApiPropertyOptional({ enum: LinkTypeDto }) @IsOptional() @IsEnum(LinkTypeDto) override link_type: LinkTypeDto;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) override link_ref: string;
}

// --- Banners ---

export class CreateBannerDto {
  @ApiProperty({ example: 'home_top', maxLength: 32 })
  @IsString() @IsNotEmpty() @MaxLength(32)
  placement: string;

  @ApiProperty({ example: 'https://cdn/strip.webp', maxLength: 500 })
  @IsString() @IsNotEmpty() @MaxLength(500)
  image_url: string;

  @ApiProperty({ example: 'Free delivery over ৳5000', maxLength: 160 })
  @IsString() @IsNotEmpty() @MaxLength(160)
  alt_text: string;

  @ApiProperty({ enum: LinkTypeDto, example: LinkTypeDto.URL })
  @IsEnum(LinkTypeDto)
  link_type: LinkTypeDto;

  @ApiProperty({ example: 'https://sportshop.com.bd/offers', maxLength: 255 })
  @IsString() @IsNotEmpty() @MaxLength(255)
  link_ref: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @IsInt() @Min(0)
  priority?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional() @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  starts_at?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  ends_at?: string;
}

export class UpdateBannerDto extends CreateBannerDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) override placement: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) override image_url: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) override alt_text: string;
  @ApiPropertyOptional({ enum: LinkTypeDto }) @IsOptional() @IsEnum(LinkTypeDto) override link_type: LinkTypeDto;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) override link_ref: string;
}

// --- Sections ---

export class CreateSectionDto {
  @ApiProperty({ enum: SectionTypeDto, example: SectionTypeDto.FEATURED_PRODUCTS })
  @IsEnum(SectionTypeDto)
  type: SectionTypeDto;

  @ApiProperty({ example: 'New Arrivals', maxLength: 120 })
  @IsString() @IsNotEmpty() @MaxLength(120)
  title: string;

  @ApiProperty({ example: ['c7…', 'c9…'], type: [String] })
  @IsArray() @ArrayMinSize(1) @IsString({ each: true })
  item_refs: string[];

  @ApiPropertyOptional({ example: 2 })
  @IsOptional() @IsInt() @Min(0)
  display_order?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional() @IsBoolean()
  is_published?: boolean;
}

export class UpdateSectionDto extends CreateSectionDto {
  @ApiPropertyOptional({ enum: SectionTypeDto }) @IsOptional() @IsEnum(SectionTypeDto) override type: SectionTypeDto;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) override title: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) override item_refs: string[];
}

// --- Reorder + responses ---

export class ReorderDto {
  @ApiProperty({ example: ['sl_2', 'sl_1', 'sl_3'], type: [String] })
  @IsArray() @IsString({ each: true })
  ordered_ids: string[];
}

export class IdResponseDto {
  @ApiProperty({ example: 'sl_9' }) id: string;
}
