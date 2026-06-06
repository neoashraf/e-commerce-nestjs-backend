import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional } from 'class-validator';

import { OrderPaymentState, OrderStatus } from '../../domain/order-enums';

/** POST /internal/orders/{orderNo}/payment-state body — PAY reflects a payment outcome (FR-ORD-010–013). */
export class ReflectPaymentStateDto {
  @ApiProperty({ enum: OrderPaymentState, example: OrderPaymentState.PAID })
  @IsEnum(OrderPaymentState)
  payment_state: OrderPaymentState;

  @ApiPropertyOptional({ example: '2026-06-03T10:05:11Z', description: 'When the payment outcome occurred.' })
  @IsOptional()
  @IsISO8601()
  at?: string;
}

export class PaymentStateResultDto {
  @ApiProperty({ example: 'SO-100245' })
  order_no: string;

  @ApiProperty({ enum: OrderStatus, example: OrderStatus.CONFIRMED })
  status: OrderStatus;
}
