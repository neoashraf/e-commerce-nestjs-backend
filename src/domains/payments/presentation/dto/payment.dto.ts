import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumberString, IsString } from 'class-validator';

import { PaymentMethod, PaymentStatus } from '../../domain/payment-enums';

/** POST /payments/initiate body (FR-PAY-001–005). */
export class InitiatePaymentDto {
  @ApiProperty({ example: 'ord_88a1…', description: 'Order UUID to pay.' })
  @IsString()
  @IsNotEmpty()
  order_id: string;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.BKASH })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;
}

/** POST /payments/retry body (FR-PAY-004). */
export class RetryPaymentDto {
  @ApiProperty({ example: 'ord_88a1…' })
  @IsString()
  @IsNotEmpty()
  order_id: string;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.SSLCOMMERZ })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;
}

export class InitiateResultDto {
  @ApiProperty({ example: 'pay_1' })
  payment_id: string;

  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.INITIATED })
  status: PaymentStatus;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.BKASH })
  method: PaymentMethod;

  @ApiProperty({ example: 'redirect', enum: ['redirect', 'none'] })
  action: 'redirect' | 'none';

  @ApiPropertyOptional({ example: 'https://sandbox.bkash.com/checkout?paymentID=TR0011…' })
  redirect_url?: string;

  @ApiPropertyOptional({ example: 'TR0011sdf…' })
  gateway_payment_id?: string;
}

export class PaymentStatusDto {
  @ApiProperty({ example: 'pay_1' })
  payment_id: string;

  @ApiProperty({ example: 'ord_88…' })
  order_id: string;

  @ApiProperty({ enum: PaymentMethod })
  method: PaymentMethod;

  @ApiProperty({ enum: PaymentStatus })
  status: PaymentStatus;

  @ApiProperty({ example: '12241.20' })
  amount: string;

  @ApiProperty({ example: 'BDT' })
  currency: string;

  @ApiPropertyOptional({ example: 'BKH99X2…' })
  gateway_txn_id: string | null;

  @ApiPropertyOptional({ example: '2026-06-03T10:05:11Z' })
  paid_at: Date | null;

  @ApiProperty({ example: '0.00' })
  refunded_amount: string;
}

// --- COD ---

export class CodCollectedDto {
  @ApiProperty({ example: '12241.20', description: 'Amount collected at the door (Decimal 12,2).' })
  @IsNumberString()
  collected_amount: string;
}

export class CodFailedDto {
  @ApiProperty({ example: 'customer_refused', description: 'Why COD collection failed.' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
