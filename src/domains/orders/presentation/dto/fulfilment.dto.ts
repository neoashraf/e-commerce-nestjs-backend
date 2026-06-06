import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { OrderStatus } from '../../domain/order-enums';

/** PATCH /admin/orders/{orderNo}/status body — advance fulfilment + record shipment (FR-ORD-020–024). */
export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus, example: OrderStatus.SHIPPED, description: 'Next forward status.' })
  @IsEnum(OrderStatus)
  to_status: OrderStatus;

  @ApiPropertyOptional({ example: 'Pathao', description: 'Courier name — required when entering `shipped`.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  courier_name?: string;

  @ApiPropertyOptional({ example: 'PA-99821', description: 'Tracking number — required when entering `shipped`.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  tracking_number?: string;

  @ApiPropertyOptional({ example: 'Handed to courier' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

/** POST /admin/orders/{orderNo}/cancel and POST /me/orders/{orderNo}/cancel body. */
export class CancelOrderDto {
  @ApiProperty({ example: 'stock_issue', description: 'Reason for the cancellation.' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  reason: string;
}

/** POST /admin/orders/{orderNo}/notes body — internal note (FR-ORD-072). */
export class AddOrderNoteDto {
  @ApiProperty({ example: 'Customer called to confirm size.' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;
}

// --- responses ---

export class UpdateOrderStatusResultDto {
  @ApiProperty({ example: 'SO-100245' })
  order_no: string;

  @ApiProperty({ enum: OrderStatus, example: OrderStatus.SHIPPED })
  status: OrderStatus;
}

export class CancellationRefundInfoDto {
  @ApiProperty({ example: true })
  triggered: boolean;
}

/** Admin cancel response (contract: `{ status, restocked, refund: { triggered } }`). */
export class AdminCancelResultDto {
  @ApiProperty({ enum: OrderStatus, example: OrderStatus.CANCELLED })
  status: OrderStatus;

  @ApiProperty({ example: true })
  restocked: boolean;

  @ApiProperty({ type: CancellationRefundInfoDto })
  refund: CancellationRefundInfoDto;
}

export class CustomerCancelRefundDto {
  @ApiProperty({ example: true, description: '`true` only for a prepaid (`paid`) online order.' })
  applicable: boolean;

  @ApiPropertyOptional({ example: 'gateway', description: 'Refund channel when applicable.' })
  type?: string;

  @ApiPropertyOptional({ example: 'Prepaid amount will be refunded to source.' })
  note?: string;
}

/** Customer cancel response (contract: `{ order_no, status, refund: { applicable, type, note } }`). */
export class CustomerCancelResultDto {
  @ApiProperty({ example: 'SO-100245' })
  order_no: string;

  @ApiProperty({ enum: OrderStatus, example: OrderStatus.CANCELLED })
  status: OrderStatus;

  @ApiProperty({ type: CustomerCancelRefundDto })
  refund: CustomerCancelRefundDto;
}

export class AddOrderNoteResultDto {
  @ApiProperty({ example: 'note_3' })
  id: string;

  @ApiProperty({ example: '2026-06-04T11:00:00Z' })
  created_at: string;
}
