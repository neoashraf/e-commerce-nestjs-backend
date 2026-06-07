import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import { FacetSource, FacetType } from '../../domain/search-enums';

/** Create a facet definition (contract: POST /admin/search/facets). */
export class CreateFacetDto {
  @ApiProperty({ example: 'surface', maxLength: 60 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  key: string;

  @ApiProperty({ example: 'Surface', maxLength: 80 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label: string;

  @ApiProperty({ enum: FacetType, example: FacetType.TERM })
  @IsEnum(FacetType)
  type: FacetType;

  @ApiProperty({ enum: FacetSource, example: FacetSource.ATTRIBUTE })
  @IsEnum(FacetSource)
  source: FacetSource;

  @ApiPropertyOptional({ example: 'surface_type', maxLength: 60, description: 'Required when source=attribute' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  source_attribute_key?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_multi_select?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  hide_zero_counts?: boolean;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  display_order?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

/** Update a facet definition (PATCH; all fields optional). */
export class UpdateFacetDto {
  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  key?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @ApiPropertyOptional({ enum: FacetType })
  @IsOptional()
  @IsEnum(FacetType)
  type?: FacetType;

  @ApiPropertyOptional({ enum: FacetSource })
  @IsOptional()
  @IsEnum(FacetSource)
  source?: FacetSource;

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  source_attribute_key?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_multi_select?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hide_zero_counts?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  display_order?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

/** Create-facet response (contract: POST /admin/search/facets → 201 {id,key}). */
export class FacetCreatedDto {
  @ApiProperty({ example: 'fct_3' }) id: string;
  @ApiProperty({ example: 'surface' }) key: string;
}
