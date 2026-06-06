import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import {
  ExchangeReason,
  ExchangeStatus,
  ReturnedItemDisposition,
} from '../../domain/exchange-enums';

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/** POST /me/orders/{orderNo}/exchanges body — request an exchange (FR-ORD-045/046). */
export class RequestExchangeDto {
  @ApiProperty({ example: 'oi_1', description: 'The delivered order item to exchange.' })
  @IsUUID()
  order_item_id: string;

  @ApiProperty({ enum: ExchangeReason, example: ExchangeReason.WRONG_SIZE })
  @IsEnum(ExchangeReason)
  reason: ExchangeReason;

  @ApiPropertyOptional({ example: 'Need size 43' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  customer_note?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Evidence attachment ids (required when reason = quality_defect).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  attachment_ids?: string[];
}

/** POST /me/orders/{orderNo}/exchanges/{exchangeId}/replacement body (FR-ORD-048). */
export class ConfirmReplacementDto {
  @ApiProperty({ example: 'v_43', description: 'Chosen replacement variant (equal/higher value).' })
  @IsUUID()
  replacement_variant_id: string;
}

/** POST /admin/exchanges/{exchangeId}/decision body — approve / reject (FR-ORD-046/047). */
export class ExchangeDecisionDto {
  @ApiProperty({ enum: ['approve', 'reject'], example: 'approve' })
  @IsIn(['approve', 'reject'])
  decision: 'approve' | 'reject';

  @ApiPropertyOptional({ example: 'outside_window', description: 'Required when decision = reject.' })
  @ValidateIf((o: ExchangeDecisionDto) => o.decision === 'reject')
  @IsString()
  @MaxLength(160)
  rejection_reason?: string;
}

/** POST /admin/exchanges/{exchangeId}/issue body — issue the replacement (FR-ORD-048/049). */
export class IssueReplacementDto {
  @ApiPropertyOptional({
    example: 'v_43',
    description: 'Replacement variant; defaults to the variant the customer already chose.',
  })
  @IsOptional()
  @IsUUID()
  replacement_variant_id?: string;

  @ApiProperty({ enum: ReturnedItemDisposition, example: ReturnedItemDisposition.RESTOCKED })
  @IsEnum(ReturnedItemDisposition)
  returned_item_disposition: ReturnedItemDisposition;
}

/** GET /admin/exchanges query — filter + paginate the queue (FR-ORD-047). */
export class ListExchangesQueryDto {
  @ApiPropertyOptional({ enum: ExchangeStatus })
  @IsOptional()
  @IsEnum(ExchangeStatus)
  status?: ExchangeStatus;

  @ApiPropertyOptional({ enum: ExchangeReason })
  @IsOptional()
  @IsEnum(ExchangeReason)
  reason?: ExchangeReason;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export class RequestExchangeResultDto {
  @ApiProperty({ example: 'ex_1' })
  exchange_id: string;

  @ApiProperty({ enum: ExchangeStatus, example: ExchangeStatus.REQUESTED })
  status: ExchangeStatus;

  @ApiProperty({
    example:
      "We'll review your exchange request. Note: exchange/replacement only — no cash refund.",
  })
  message: string;
}

export class UploadAttachmentResultDto {
  @ApiProperty({ example: 'exa_1' })
  attachment_id: string;
}

export class ExchangeStatusDto {
  @ApiProperty({ example: 'ex_1' })
  exchange_id: string;

  @ApiProperty({ enum: ExchangeStatus, example: ExchangeStatus.APPROVED })
  status: ExchangeStatus;

  @ApiProperty({ enum: ExchangeReason, example: ExchangeReason.WRONG_SIZE })
  reason: ExchangeReason;

  @ApiPropertyOptional({ example: 'Choose an item of equal or higher value.' })
  replacement_options_hint?: string | null;

  @ApiProperty({ example: '0.00' })
  price_difference: string;

  @ApiProperty({ example: null, nullable: true })
  replacement_order_no: string | null;
}

export class ReplacementPaymentDto {
  @ApiProperty({ example: 'redirect' })
  action: string;

  @ApiPropertyOptional({ example: 'https://…bkash…' })
  redirect_url?: string | null;
}

export class ConfirmReplacementResultDto {
  @ApiProperty({ enum: ExchangeStatus, example: ExchangeStatus.REPLACEMENT_ISSUED })
  status: ExchangeStatus;

  @ApiProperty({ example: '0.00' })
  price_difference: string;

  @ApiPropertyOptional({ example: 'SO-100299', nullable: true })
  replacement_order_no?: string | null;

  @ApiPropertyOptional({ type: ReplacementPaymentDto })
  payment?: ReplacementPaymentDto;
}

export class ExchangeQueueItemRefDto {
  @ApiProperty({ example: 'PRED-BLK-42' })
  sku_code: string;

  @ApiProperty({ example: 'Adidas Predator Elite' })
  title: string;
}

export class ExchangeQueueItemDto {
  @ApiProperty({ example: 'ex_1' })
  exchange_id: string;

  @ApiProperty({ example: 'SO-100245' })
  order_no: string;

  @ApiProperty({ type: ExchangeQueueItemRefDto })
  order_item: ExchangeQueueItemRefDto;

  @ApiProperty({ enum: ExchangeReason, example: ExchangeReason.QUALITY_DEFECT })
  reason: ExchangeReason;

  @ApiProperty({ enum: ExchangeStatus, example: ExchangeStatus.UNDER_QA_REVIEW })
  status: ExchangeStatus;

  @ApiProperty({ example: '2026-06-11T17:00:00Z', nullable: true })
  qa_due_at: string | null;

  @ApiProperty({ example: '2026-06-04T09:00:00Z' })
  created_at: string;
}

export class ExchangeAttachmentDto {
  @ApiProperty({ example: 'exa_1' })
  attachment_id: string;

  @ApiProperty({ example: 'https://cdn…/evidence.jpg' })
  url: string;

  @ApiProperty({ example: 'image/jpeg' })
  content_type: string;
}

export class ExchangeDetailDto extends ExchangeQueueItemDto {
  @ApiPropertyOptional({ example: 'Sole separated after one use.' })
  customer_note?: string | null;

  @ApiPropertyOptional({ example: 'outside_window', nullable: true })
  rejection_reason?: string | null;

  @ApiProperty({ example: '0.00' })
  price_difference: string;

  @ApiProperty({ example: null, nullable: true })
  replacement_variant_id: string | null;

  @ApiProperty({ example: null, nullable: true })
  replacement_order_no: string | null;

  @ApiProperty({ enum: ReturnedItemDisposition, nullable: true })
  returned_item_disposition: ReturnedItemDisposition | null;

  @ApiProperty({ type: [ExchangeAttachmentDto] })
  attachments: ExchangeAttachmentDto[];
}

export class ExchangeDecisionResultDto {
  @ApiProperty({ example: 'ex_1' })
  exchange_id: string;

  @ApiProperty({ enum: ExchangeStatus, example: ExchangeStatus.APPROVED })
  status: ExchangeStatus;
}

export class IssueReplacementResultDto {
  @ApiProperty({ example: 'ex_1' })
  exchange_id: string;

  @ApiProperty({ enum: ExchangeStatus, example: ExchangeStatus.REPLACEMENT_ISSUED })
  status: ExchangeStatus;

  @ApiProperty({ example: 'SO-100299' })
  replacement_order_no: string;

  @ApiProperty({ example: 'exchanged' })
  order_status: string;

  @ApiProperty({ example: '0.00' })
  price_difference: string;
}
