import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { InsightsType, RedirectTargetType } from '../../domain/search-enums';

/** Create/update a synonym group (contract: POST /admin/search/synonyms). */
export class CreateSynonymDto {
  @ApiProperty({ example: ['boots', 'cleats'], type: [String], description: '≥2 interchangeable terms' })
  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  terms: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateSynonymDto {
  @ApiPropertyOptional({ example: ['boots', 'cleats'], type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  terms?: string[];

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

/** Create/update a redirect (contract: POST /admin/search/redirects). */
export class CreateRedirectDto {
  @ApiProperty({ example: 'predator', maxLength: 120 })
  @IsString()
  @MaxLength(120)
  query_pattern: string;

  @ApiProperty({ enum: RedirectTargetType, example: RedirectTargetType.CATEGORY })
  @IsEnum(RedirectTargetType)
  target_type: RedirectTargetType;

  @ApiProperty({ example: 'predator-collection', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  target_ref: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateRedirectDto {
  @ApiPropertyOptional({ example: 'predator', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  query_pattern?: string;

  @ApiPropertyOptional({ enum: RedirectTargetType })
  @IsOptional()
  @IsEnum(RedirectTargetType)
  target_type?: RedirectTargetType;

  @ApiPropertyOptional({ example: 'predator-collection', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  target_ref?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

/** Insights query (contract: GET /admin/search/insights). */
export class InsightsQueryDto {
  @ApiProperty({ enum: InsightsType, example: InsightsType.ZERO_RESULTS })
  @IsEnum(InsightsType)
  type: InsightsType;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-06-04' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsString()
  limit?: string;
}

/** Reindex 202 response (contract: POST /admin/search/reindex). */
export class ReindexResponseDto {
  @ApiProperty({ example: 'reindex_55' }) job_id: string;
  @ApiProperty({ example: 'running' }) status: string;
}

/** Insight row (contract: GET /admin/search/insights data[]). */
export class InsightRowDto {
  @ApiProperty({ example: 'messi boots' }) normalized_text: string;
  @ApiProperty({ example: 0 }) result_count: number;
  @ApiProperty({ example: 14 }) occurrences: number;
}
