import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Create a CMS page (contract: POST /admin/pages). Draft by default. */
export class CreatePageDto {
  @ApiProperty({ example: 'size-guide', maxLength: 140 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(140)
  slug: string;

  @ApiProperty({ example: 'Size Guide', maxLength: 160 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title: string;

  @ApiProperty({ example: '<h2>Boot Sizing</h2><p>…</p>', description: 'Sanitized rich-text HTML' })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional({ example: 'Size Guide | SportShop BD', maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  seo_title?: string;

  @ApiPropertyOptional({ example: 'Find your boot size.', maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  seo_description?: string;

  @ApiPropertyOptional({ example: false, description: 'Defaults to false (draft)' })
  @IsOptional()
  @IsBoolean()
  is_published?: boolean;
}

/** Update a CMS page (contract: PATCH /admin/pages/{id}). All fields optional. */
export class UpdatePageDto {
  @ApiPropertyOptional({ maxLength: 140 })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  slug?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  seo_title?: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  seo_description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_published?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Confirms a slug change on a linked page (FR-CMS-044)' })
  @IsOptional()
  @IsBoolean()
  confirm_slug_change?: boolean;
}

/** Admin page list row (contract: GET /admin/pages). */
export class PageListRowDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiProperty() is_published: boolean;
  @ApiProperty() is_system: boolean;
  @ApiProperty() updated_at: Date;
}

class PageSeoDto {
  @ApiProperty({ nullable: true }) title: string | null;
  @ApiProperty({ nullable: true }) description: string | null;
}

/** Public page-by-slug (contract: GET /content/pages/{slug}). */
export class PublicPageDto {
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiProperty({ example: '<p>…</p>' }) body: string;
  @ApiProperty({ type: PageSeoDto }) seo: PageSeoDto;
  @ApiProperty() updated_at: Date;
}

/** Create-page response (contract: POST /admin/pages → 201). */
export class PageCreatedDto {
  @ApiProperty({ example: 'pg_9' }) id: string;
  @ApiProperty({ example: 'size-guide' }) slug: string;
  @ApiProperty({ example: false }) is_published: boolean;
}
