import { ApiProperty } from '@nestjs/swagger';

import {
  StockMovementActorType,
  StockMovementType,
} from '../../domain/stock-movement-type';

/** One row of the SKU movement history (contract: Admin — Movement Ledger). */
export class MovementRowDto {
  @ApiProperty() id: string;

  @ApiProperty({ enum: StockMovementType })
  type: StockMovementType;

  @ApiProperty({ description: 'Signed change applied', example: -1 })
  quantity_delta: number;

  @ApiProperty({ description: 'On-hand after the movement', example: 51 })
  resulting_on_hand: number;

  @ApiProperty({ nullable: true, example: 'supplier_delivery_GRN-1187' })
  reason: string | null;

  @ApiProperty({ nullable: true, description: 'Related order id (reserve/release/sale/restock)' })
  order_id: string | null;

  @ApiProperty({
    nullable: true,
    example: 'SO-100245',
    description: 'Human-readable order number resolved from order_id; the Movements view links to it.',
  })
  order_no: string | null;

  @ApiProperty({ enum: StockMovementActorType })
  actor_type: StockMovementActorType;

  @ApiProperty({ nullable: true, description: 'Admin id when actor_type=admin' })
  actor_id: string | null;

  @ApiProperty({ example: '2026-06-03T10:05:11Z' })
  created_at: Date;
}
