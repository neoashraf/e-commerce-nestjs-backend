import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

/** Disposition of a restock/scrap on cancel or exchange-return (FR-INV-031/032). */
export enum RestockDisposition {
  RESTOCKED = 'restocked',
  SCRAPPED = 'scrapped',
}

/** One returned line. */
export class RestockLineDto {
  @ApiProperty({ description: 'Variant (SKU) id' })
  @IsUUID()
  variant_id: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;
}

/**
 * Restock (resellable) or scrap (defective) on cancellation/exchange-return (FR-INV-031/032/033).
 * `lines` is optional for a full cancellation (defaults to the order's sold items).
 */
export class RestockDto {
  @ApiProperty({ description: 'Order being cancelled / returned against' })
  @IsString()
  order_id: string;

  @ApiProperty({ enum: RestockDisposition })
  @IsEnum(RestockDisposition)
  disposition: RestockDisposition;

  @ApiPropertyOptional({
    type: [RestockLineDto],
    description: 'Specific returned lines; omit for a full cancellation (defaults to sold items)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RestockLineDto)
  lines?: RestockLineDto[];
}
