import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** bKash auth callback query/body (the provider's raw fields). */
export class BkashCallbackDto {
  @ApiPropertyOptional({ example: 'TR0011…', description: 'bKash paymentID.' })
  @IsOptional()
  @IsString()
  paymentID?: string;

  @ApiPropertyOptional({ example: 'success', description: 'bKash status (advisory).' })
  @IsOptional()
  @IsString()
  status?: string;
}

/** SSLCommerz IPN body (application/x-www-form-urlencoded provider fields). */
export class SslcommerzIpnDto {
  @ApiPropertyOptional({ example: 'PAY-…', description: 'Merchant tran_id (== internal_ref).' })
  @IsOptional()
  @IsString()
  tran_id?: string;

  @ApiPropertyOptional({ example: 'val_…', description: 'Validation id for the Order Validation API.' })
  @IsOptional()
  @IsString()
  val_id?: string;

  @ApiPropertyOptional({ example: '12241.20' })
  @IsOptional()
  @IsString()
  amount?: string;

  @ApiPropertyOptional({ example: 'VALID' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'BANK-…' })
  @IsOptional()
  @IsString()
  bank_tran_id?: string;

  @ApiPropertyOptional({ example: 'sign…' })
  @IsOptional()
  @IsString()
  verify_sign?: string;
}

/** SSLCommerz advisory return (success/fail/cancel) — never finalizes payment. */
export class SslcommerzReturnDto {
  @ApiPropertyOptional({ example: 'PAY-…' })
  @IsOptional()
  @IsString()
  tran_id?: string;
}
