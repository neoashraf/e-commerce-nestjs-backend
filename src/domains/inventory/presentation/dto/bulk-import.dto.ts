import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Hard cap on rows in a single synchronous bulk request (MVP; async for very large files is an Open Q). */
export const BULK_MAX_ROWS = 5000;

/** One JSON bulk row (contract: Bulk update / import request `rows[]`). */
export class BulkImportRowDto {
  @ApiProperty({ example: 'PRED-BLK-42', description: 'Globally unique SKU code (CAT variant)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sku_code: string;

  @ApiProperty({ example: 30, minimum: 0, description: 'Absolute target on-hand (set, not add)' })
  @IsInt()
  @Min(0)
  set_on_hand: number;

  @ApiPropertyOptional({ example: 5, minimum: 0, description: 'Optional low-stock threshold to set' })
  @IsOptional()
  @IsInt()
  @Min(0)
  low_stock_threshold?: number;

  @ApiProperty({ example: 'stock_take_2026Q2', description: 'Required reason for the correction' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  reason: string;
}

/** Bulk update / import request body (JSON). The CSV upload carries the same columns via multipart. */
export class BulkImportDto {
  @ApiProperty({ type: [BulkImportRowDto], description: 'Rows to apply (continue-on-error)' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => BulkImportRowDto)
  rows: BulkImportRowDto[];
}
