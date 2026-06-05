import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** One ordered group in a family's grouping (`{ name, column, position, attribute_codes[] }`). */
export class FamilyGroupDto {
  @ApiProperty({ example: 'General', maxLength: 80 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @ApiProperty({ example: 1, enum: [1, 2], description: 'Editor layout column (1 or 2)' })
  @IsIn([1, 2])
  column: number;

  @ApiProperty({ example: 1, minimum: 0, description: 'Group order within its column' })
  @IsInt()
  @Min(0)
  position: number;

  @ApiProperty({
    type: [String],
    example: ['sku', 'name', 'brand', 'color', 'size'],
    description: 'Existing attribute codes, in laid-out order',
  })
  @IsArray()
  @IsString({ each: true })
  attribute_codes: string[];
}

/** Create an attribute family (FR-CAT-060/061/062). Request fields are snake_case per the contract. */
export class CreateAttributeFamilyDto {
  @ApiProperty({ example: 'mens_footwear', maxLength: 60, description: 'Stable lower snake_case code; immutable' })
  @IsString()
  @MaxLength(60)
  @Matches(/^[a-z0-9_]{2,60}$/, {
    message: 'code must be 2–60 chars of lowercase letters, digits, or underscore',
  })
  code: string;

  @ApiProperty({ example: 'Mens Footwear', maxLength: 80 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @ApiProperty({ type: [FamilyGroupDto], description: 'Ordered groups; must include all mandatory system attributes' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FamilyGroupDto)
  groups: FamilyGroupDto[];
}
