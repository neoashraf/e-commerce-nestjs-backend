import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { DISPLAY_MODES, DisplayMode } from '../../domain/enums/display-mode.enum';

/** Create a category (FR-CAT-001/002/009/010a). Request fields are snake_case per the contract. */
export class CreateCategoryDto {
  @ApiProperty({ example: 'Football Boots', minLength: 2, maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ description: 'Parent category id; omit/null for a top-level category' })
  @IsOptional()
  @IsUUID()
  parent_id?: string | null;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ enum: DISPLAY_MODES, default: DisplayMode.PRODUCTS_AND_DESCRIPTION })
  @IsOptional()
  @IsIn(DISPLAY_MODES)
  display_mode?: DisplayMode;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  show_in_menu?: boolean;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  image_url?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logo_url?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  banner_url?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['brand', 'color', 'size', 'surface_type'],
    description: 'Existing attribute codes used as layered-nav facets (FR-CAT-009)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  filterable_attribute_codes?: string[];

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
