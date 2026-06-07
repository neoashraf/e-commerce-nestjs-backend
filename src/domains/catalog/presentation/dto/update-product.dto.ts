import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const MONEY_REGEX = /^\d{1,10}(\.\d{1,2})?$/;

/**
 * Update-product request (FR-CAT-012/018/019/065). Any subset of the create body except `type`
 * and `family_id` (immutable). `updated_at` carries optimistic-concurrency — a stale value →
 * `409 STALE_WRITE`. Snake_case per the API contract.
 */
export class UpdateProductDto {
  @ApiProperty({ example: '2026-06-05T10:00:00.000Z', description: 'Optimistic-concurrency token' })
  @IsString()
  @IsNotEmpty()
  updated_at: string;

  @ApiPropertyOptional({ maxLength: 180 })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  name?: string;

  @ApiPropertyOptional({ description: 'Primary owning category UUID' })
  @IsOptional()
  @IsUUID()
  primary_category_id?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  category_ids?: string[];

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  short_description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '14000.00' })
  @IsOptional()
  @IsString()
  @Matches(MONEY_REGEX, { message: 'base_price must be a money value like "14000.00"' })
  base_price?: string;

  @ApiPropertyOptional({ example: '12500.00', nullable: true })
  @IsOptional()
  @IsString()
  @Matches(MONEY_REGEX, { message: 'sale_price must be a money value like "12500.00"' })
  sale_price?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  sale_starts_at?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  sale_ends_at?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_featured?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_new?: boolean;

  @ApiPropertyOptional({ example: '0.480' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,5}(\.\d{1,3})?$/, { message: 'weight must be a number like "0.480"' })
  weight?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  @Type(() => Object)
  attributes?: Record<string, unknown>;

  @ApiPropertyOptional({ maxLength: 160 })
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
