import { ApiProperty } from '@nestjs/swagger';

import { StockStatus } from '../../domain/stock-status';

/** One SKU's availability in the batch read. */
export class AvailabilityEntryDto {
  @ApiProperty({ example: 12 })
  available: number;

  @ApiProperty({ enum: StockStatus, example: StockStatus.IN_STOCK })
  status: StockStatus;
}

/** One row of the admin inventory list. */
export class InventoryRowDto {
  @ApiProperty() variant_id: string;
  @ApiProperty() sku_code: string;
  @ApiProperty({ nullable: true }) product_title: string | null;
  @ApiProperty({
    nullable: true,
    example: { color: 'Black', size: '43' },
    description: 'Attribute label → option label (omitted when CAT labels unavailable)',
  })
  options: Record<string, string> | null;
  @ApiProperty() on_hand: number;
  @ApiProperty() reserved: number;
  @ApiProperty() available: number;
  @ApiProperty() low_stock_threshold: number;
  @ApiProperty({ enum: StockStatus }) status: StockStatus;
}

/**
 * Mutation response for receive/adjust/threshold. `movement_id` is the real ledger movement written
 * for the change (FR-INV-050); it is null only for a threshold change (no quantity movement).
 */
export class StockMutationResponseDto {
  @ApiProperty() variant_id: string;
  @ApiProperty() on_hand: number;
  @ApiProperty() available: number;
  @ApiProperty({ nullable: true, description: 'Ledger movement id (null for threshold-only changes)' })
  movement_id: string | null;
}
