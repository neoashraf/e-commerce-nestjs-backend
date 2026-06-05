import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { AttributeType } from '../../domain/enums/attribute-type.enum';
import { AttributeOptionDto } from './attribute-option.dto';

/**
 * Update an attribute's flags / options (FR-CAT-055/057/058). `code` is immutable — supplying
 * a different value is rejected `400`. An `options` array (when present) replaces the set via
 * upsert/reorder; omitting it leaves options untouched.
 */
export class UpdateAttributeDto {
  @ApiPropertyOptional({ description: 'Immutable — supplying a changed value is rejected (400)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string;

  @ApiPropertyOptional({ example: 'Shoe Type', maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  admin_label?: string;

  @ApiPropertyOptional({ enum: AttributeType })
  @IsOptional()
  @IsEnum(AttributeType)
  type?: AttributeType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_required?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_unique?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_filterable?: boolean;

  @ApiPropertyOptional({ description: 'Only valid for `select`; cleared on a type change away from select' })
  @IsOptional()
  @IsBoolean()
  is_configurable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_visible_on_front?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_comparable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  validation?: string | null;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  default_value?: string | null;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @ApiPropertyOptional({ type: [AttributeOptionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeOptionDto)
  options?: AttributeOptionDto[];
}
