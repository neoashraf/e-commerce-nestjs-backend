import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { FamilyGroupDto } from './create-attribute-family.dto';

/**
 * Update a family's grouping (full replace) and optionally its `name` (FR-CAT-061).
 * `code` is immutable: it is accepted but ignored (never persisted), per the contract.
 */
export class UpdateAttributeFamilyDto {
  @ApiPropertyOptional({ example: 'Mens Footwear', maxLength: 80 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ description: 'Ignored — family code is immutable after creation' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ type: [FamilyGroupDto], description: 'Full replacement of the grouping' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FamilyGroupDto)
  groups: FamilyGroupDto[];
}
