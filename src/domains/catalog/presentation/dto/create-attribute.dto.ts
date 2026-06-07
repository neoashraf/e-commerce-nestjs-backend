import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { AttributeType } from '../../domain/enums/attribute-type.enum';
import { AttributeOptionDto } from './attribute-option.dto';

/** Create an attribute (FR-CAT-050/051/057/058). Request fields are snake_case per the contract. */
export class CreateAttributeDto {
  @ApiProperty({ example: 'shoe_type', maxLength: 60, description: 'Stable lower snake_case code; immutable' })
  @IsString()
  @MaxLength(60)
  @Matches(/^[a-z0-9_]{2,60}$/, {
    message: 'code must be 2–60 chars of lowercase letters, digits, or underscore',
  })
  code: string;

  @ApiProperty({ example: 'Shoe Type', maxLength: 80 })
  @IsString()
  @MaxLength(80)
  admin_label: string;

  @ApiProperty({ enum: AttributeType, example: AttributeType.SELECT })
  @IsEnum(AttributeType)
  type: AttributeType;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  is_required?: boolean;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  is_unique?: boolean;

  @ApiPropertyOptional({ example: true, default: false })
  @IsOptional()
  @IsBoolean()
  is_filterable?: boolean;

  @ApiPropertyOptional({ example: false, default: false, description: 'Variant-forming; only valid for `select`' })
  @IsOptional()
  @IsBoolean()
  is_configurable?: boolean;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  is_visible_on_front?: boolean;

  @ApiPropertyOptional({ example: true, default: false })
  @IsOptional()
  @IsBoolean()
  is_comparable?: boolean;

  @ApiPropertyOptional({ example: null, maxLength: 120, description: 'Optional input validation rule (regex)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  validation?: string | null;

  @ApiPropertyOptional({ example: null, maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  default_value?: string | null;

  @ApiPropertyOptional({ example: 0, minimum: 0, description: 'Default ordering' })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @ApiPropertyOptional({ type: [AttributeOptionDto], description: 'Required (≥1) for select / multiselect' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeOptionDto)
  options?: AttributeOptionDto[];
}
