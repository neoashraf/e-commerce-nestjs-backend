import { ApiProperty } from '@nestjs/swagger';

/** One per-row failure in the bulk results report (contract: Bulk update / import `errors[]`). */
export class BulkRowErrorDto {
  @ApiProperty({ example: 14, description: '1-based row number (CSV header excluded)' })
  row: number;

  @ApiProperty({ example: 'XXX' })
  sku_code: string;

  @ApiProperty({
    example: 'unknown_sku',
    description:
      'Reason code: missing_sku_code | invalid_set_on_hand | invalid_threshold | missing_reason | unknown_sku | would_be_negative | no_inventory_record | apply_failed',
  })
  error: string;
}

/** Bulk update / import results report (contract: Bulk update / import response `data`). */
export class BulkResultDto {
  @ApiProperty({ example: 120, description: 'Total rows received' })
  processed: number;

  @ApiProperty({ example: 118, description: 'Rows applied successfully' })
  succeeded: number;

  @ApiProperty({ example: 2, description: 'Rows that failed validation or apply' })
  failed: number;

  @ApiProperty({ type: [BulkRowErrorDto], description: 'Per-row errors (continue-on-error)' })
  errors: BulkRowErrorDto[];
}
