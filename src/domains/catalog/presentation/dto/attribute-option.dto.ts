import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { SwatchType } from '../../domain/enums/swatch-type.enum';

/**
 * A select/multiselect attribute option (FR-CAT-051). Used in both create and update
 * payloads; in an update an `id` targets an existing row (upsert), omitting it inserts.
 */
export class AttributeOptionDto {
  @ApiPropertyOptional({ description: 'Existing option id (update/upsert); omit to insert.' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'fg', maxLength: 60, description: 'Canonical value (unique per attribute)' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Matches(/^\S.*$/, { message: 'value must not be blank' })
  value: string;

  @ApiProperty({ example: 'Firm Ground (FG)', maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label: string;

  @ApiPropertyOptional({ enum: SwatchType, description: 'Swatch kind for a colour/image swatch' })
  @IsOptional()
  @IsEnum(SwatchType)
  swatch_type?: SwatchType | null;

  @ApiPropertyOptional({ example: '#000000', maxLength: 120, description: 'Hex colour or image URL' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  swatch_value?: string | null;

  @ApiPropertyOptional({ example: 1, minimum: 0, description: 'Display order' })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
