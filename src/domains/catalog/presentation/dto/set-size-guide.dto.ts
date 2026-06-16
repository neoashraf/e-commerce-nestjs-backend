import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** One UK↔foot-length row of a category size guide (RW6). */
export class SizeGuideRowDto {
  @ApiProperty({ example: '7' })
  @IsString()
  @MaxLength(16)
  uk: string;

  @ApiProperty({ example: '25.4' })
  @IsString()
  @MaxLength(16)
  foot: string;
}

/** The size-guide body of `PUT /admin/categories/{id}/size-guide` (RW6). */
export class SizeGuideBodyDto {
  @ApiProperty({ example: 'Measure your foot heel-to-toe and match the closest length below.' })
  @IsString()
  @MaxLength(500)
  measure_note: string;

  @ApiProperty({ example: 'cm' })
  @IsString()
  @MaxLength(8)
  unit: string;

  @ApiProperty({ type: [SizeGuideRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SizeGuideRowDto)
  rows: SizeGuideRowDto[];
}

/**
 * Set or clear a category's footwear size guide (RW6). Provide `size_guide` to set it; send
 * `size_guide: null` (or omit) to clear it.
 */
export class SetSizeGuideDto {
  @ApiPropertyOptional({ type: SizeGuideBodyDto, nullable: true })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SizeGuideBodyDto)
  size_guide?: SizeGuideBodyDto | null;
}
