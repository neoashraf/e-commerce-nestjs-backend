import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumberString, IsString } from 'class-validator';

/** Allowed refund reasons (BR-PAY-6) — never a post-delivery return. */
export enum RefundReason {
  PREPAID_ORDER_CANCELLED = 'prepaid_order_cancelled',
  DUPLICATE_CAPTURE = 'duplicate_capture',
  PAYMENT_ERROR = 'payment_error',
}

/** POST /admin/payments/{id}/refund body (FR-PAY-050/051). */
export class RefundDto {
  @ApiProperty({ example: '12241.20', description: 'Refund amount (≤ captured − already refunded).' })
  @IsNumberString()
  amount: string;

  @ApiProperty({ enum: RefundReason, example: RefundReason.PREPAID_ORDER_CANCELLED })
  @IsEnum(RefundReason)
  reason: RefundReason;
}

export class RefundResultDto {
  @ApiProperty({ example: 'rf_1' })
  refund_id: string;

  @ApiProperty({ example: 'gateway' })
  type: string;

  @ApiProperty({ example: 'pending' })
  status: string;

  @ApiProperty({ example: 'refund_pending' })
  payment_status: string;
}

/** POST /payments/exchange-difference body (FR-PAY-053). */
export class ExchangeDifferenceDto {
  @ApiProperty({ example: 'ord_88…' })
  @IsString()
  order_id: string;

  @ApiProperty({ example: 'ex_1' })
  @IsString()
  exchange_id: string;

  @ApiProperty({ example: '1500.00', description: 'Price difference to capture (> 0).' })
  @IsNumberString()
  amount: string;

  @ApiProperty({ example: 'bkash' })
  @IsString()
  method: string;
}
