import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { DISPLAY_MODES, DisplayMode } from '../../domain/enums/display-mode.enum';

/**
 * Update / reorder / publish a category (FR-CAT-004/005/008/010a). Any subset; an absent key is
 * left untouched. A `null` clears a nullable field. `parent_id` re-parents (depth/cycle checked).
 */
export class UpdateCategoryDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ description: 'New parent id; null moves the category to the top level' })
  @IsOptional()
  @IsUUID()
  parent_id?: string | null;

  @ApiPropertyOptional({ maxLength: 5000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiPropertyOptional({ enum: DISPLAY_MODES })
  @IsOptional()
  @IsIn(DISPLAY_MODES)
  display_mode?: DisplayMode;

  @ApiPropertyOptional({ minimum: 0, description: 'Sort order among siblings' })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_published?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  show_in_menu?: boolean;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  image_url?: string | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logo_url?: string | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  banner_url?: string | null;

  @ApiPropertyOptional({
    type: [String],
    description: 'Full replace of the filterable attribute set (FR-CAT-009)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  filterable_attribute_codes?: string[];

  @ApiPropertyOptional({ maxLength: 160, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  meta_title?: string | null;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  meta_keywords?: string | null;

  @ApiPropertyOptional({ maxLength: 320, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  meta_description?: string | null;
}
