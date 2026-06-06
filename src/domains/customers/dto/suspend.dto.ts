import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Suspend request (FR-CUST-020; contract: POST /admin/customers/{id}/suspend). */
export class SuspendCustomerDto {
  @ApiPropertyOptional({ example: 'fraudulent_chargebacks', maxLength: 160, description: 'Reason for suspension' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  reason?: string;
}
