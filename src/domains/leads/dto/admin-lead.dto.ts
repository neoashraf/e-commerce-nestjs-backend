import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

import {
  LeadSource,
  LeadStatus,
  LeadType,
  MessageChannel,
  MessageDirection,
} from '../leads.enums';

// ── Requests ───────────────────────────────────────────────────────────────

/** `GET /admin/leads` filters + pagination (FR-LEAD-010). */
export class ListAdminLeadsQueryDto {
  @ApiPropertyOptional({ enum: LeadStatus, description: 'Filter by lead status' })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiPropertyOptional({ enum: LeadType, description: 'Filter by enquiry type' })
  @IsOptional()
  @IsEnum(LeadType)
  type?: LeadType;

  @ApiPropertyOptional({ description: 'Filter by assigned admin id', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignee?: string;

  @ApiPropertyOptional({ description: 'Filter by linked order reference', example: 'SO-100245' })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  order?: string;

  @ApiPropertyOptional({ description: 'Created from (inclusive, ISO date/datetime)', example: '2026-06-01' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'Created to (inclusive, ISO date/datetime)', example: '2026-06-04' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

/** `POST /admin/leads/{reference}/assign` (FR-LEAD-012). */
export class AssignLeadDto {
  @ApiProperty({ description: 'Admin to assign/reassign the lead to', format: 'uuid' })
  @IsUUID()
  admin_id: string;
}

/** `POST /admin/leads/{reference}/reply` (FR-LEAD-013). */
export class AdminReplyDto {
  @ApiProperty({ example: "We'll arrange an exchange.", minLength: 1, maxLength: 2000 })
  @IsString()
  @Length(1, 2000)
  body: string;

  @ApiProperty({ enum: MessageChannel, description: 'Delivery channel (must be available for the submitter)' })
  @IsEnum(MessageChannel)
  channel: MessageChannel;
}

/** `POST /admin/leads/{reference}/notes` (FR-LEAD-015). */
export class InternalNoteDto {
  @ApiProperty({ example: 'Verified order in system; size mismatch confirmed.', minLength: 1, maxLength: 2000 })
  @IsString()
  @Length(1, 2000)
  body: string;
}

/** Statuses an admin may set (FR-LEAD-014). `new` is the system-assigned initial state only. */
export enum AdminLeadStatus {
  OPEN = 'open',
  AWAITING_CUSTOMER = 'awaiting_customer',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  SPAM = 'spam',
}

/** `PATCH /admin/leads/{reference}/status` (FR-LEAD-014). */
export class ChangeStatusDto {
  @ApiProperty({ enum: AdminLeadStatus })
  @IsEnum(AdminLeadStatus)
  status: AdminLeadStatus;
}

/** Handoff action (FR-LEAD-016). `exchange` = post-delivery; `cancel` = pre-dispatch. No cash refund. */
export enum HandoffAction {
  EXCHANGE = 'exchange',
  CANCEL = 'cancel',
}

/** `POST /admin/leads/{reference}/handoff-exchange` (FR-LEAD-016, BR-LEAD-3). */
export class HandoffExchangeDto {
  @ApiProperty({ example: 'SO-100245' })
  @IsString()
  @Length(1, 40)
  order_reference: string;

  @ApiProperty({ description: 'The order item to exchange/cancel' })
  @IsString()
  @Length(1, 64)
  order_item_id: string;

  @ApiProperty({ enum: HandoffAction })
  @IsEnum(HandoffAction)
  action: HandoffAction;

  @ApiProperty({ example: 'wrong_size' })
  @IsString()
  @Length(1, 200)
  reason: string;
}

// ── Responses ──────────────────────────────────────────────────────────────

/** Submitter contact summary on a list row. */
export class LeadSubmitterDto {
  @ApiProperty({ example: 'Sabbir Ahmed' })
  name: string;

  @ApiProperty({ example: '+8801712345678' })
  phone: string;
}

/** Row of `GET /admin/leads` (FR-LEAD-010). */
export class AdminLeadListItemDto {
  @ApiProperty({ example: 'HLP-20451' })
  reference: string;

  @ApiProperty({ enum: LeadType, example: LeadType.CLAIM_RETURN })
  type: LeadType;

  @ApiProperty({ example: 'Wrong size delivered' })
  subject: string;

  @ApiProperty({ type: LeadSubmitterDto })
  submitter: LeadSubmitterDto;

  @ApiProperty({ enum: LeadStatus, example: LeadStatus.NEW })
  status: LeadStatus;

  @ApiProperty({ example: null, nullable: true, format: 'uuid' })
  assigned_admin_id: string | null;

  @ApiProperty({ example: 'SO-100245', nullable: true })
  order_reference: string | null;

  @ApiProperty({ example: '2026-06-04T09:00:00.000Z' })
  created_at: string;
}

/** Full submitter block on the detail view. */
export class LeadSubmitterDetailDto {
  @ApiProperty({ example: 'Sabbir Ahmed' })
  name: string;

  @ApiProperty({ example: '+8801712345678' })
  phone: string;

  @ApiProperty({ example: 'sabbir@example.com', nullable: true })
  email: string | null;
}

/** Linked context (customer/order/product) — ids only; the FE expands via the owning modules. */
export class LeadLinksDto {
  @ApiProperty({ example: null, nullable: true, format: 'uuid' })
  customer_id: string | null;

  @ApiProperty({ example: null, nullable: true, format: 'uuid' })
  order_id: string | null;

  @ApiProperty({ example: 'SO-100245', nullable: true })
  order_reference: string | null;

  @ApiProperty({ example: null, nullable: true, format: 'uuid' })
  product_id: string | null;
}

/** One thread message on the admin detail (internal notes INCLUDED — BR-LEAD-7 only hides them from customers). */
export class AdminThreadMessageDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: MessageDirection, example: MessageDirection.INBOUND })
  direction: MessageDirection;

  @ApiProperty({ example: null, nullable: true, format: 'uuid' })
  author_admin_id: string | null;

  @ApiProperty({ example: 'I ordered size 42 but received 43.' })
  body: string;

  @ApiProperty({ enum: MessageChannel, nullable: true, example: null })
  channel: MessageChannel | null;

  @ApiProperty({ example: false })
  is_internal_note: boolean;

  @ApiProperty({ example: '2026-06-04T09:00:00.000Z' })
  created_at: string;
}

/** Claim evidence on the detail view. */
export class LeadAttachmentDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'https://cdn.example.com/leads/3f2504e0.jpg' })
  url: string;

  @ApiProperty({ example: 'image/jpeg' })
  content_type: string;

  @ApiProperty({ example: 824133 })
  size_bytes: number;
}

/** `GET /admin/leads/{reference}` (FR-LEAD-011). */
export class AdminLeadDetailDto {
  @ApiProperty({ example: 'HLP-20451' })
  reference: string;

  @ApiProperty({ enum: LeadType, example: LeadType.CLAIM_RETURN })
  type: LeadType;

  @ApiProperty({ example: 'Wrong size delivered' })
  subject: string;

  @ApiProperty({ enum: LeadStatus, example: LeadStatus.NEW })
  status: LeadStatus;

  @ApiProperty({ enum: LeadSource, example: LeadSource.GET_HELP })
  source: LeadSource;

  @ApiProperty({ example: null, nullable: true, format: 'uuid' })
  assigned_admin_id: string | null;

  @ApiProperty({ type: LeadSubmitterDetailDto })
  submitter: LeadSubmitterDetailDto;

  @ApiProperty({ type: LeadLinksDto })
  links: LeadLinksDto;

  @ApiProperty({ type: [AdminThreadMessageDto] })
  messages: AdminThreadMessageDto[];

  @ApiProperty({ type: [LeadAttachmentDto] })
  attachments: LeadAttachmentDto[];

  @ApiProperty({ example: '2026-06-04T09:00:00.000Z' })
  created_at: string;

  @ApiProperty({ example: '2026-06-04T11:00:00.000Z' })
  updated_at: string;
}

/** `POST /admin/leads/{reference}/assign` → 200 inner body. */
export class AssignLeadResultDto {
  @ApiProperty({ example: 'HLP-20451' })
  reference: string;

  @ApiProperty({ example: 'ad_1', format: 'uuid' })
  assigned_admin_id: string;
}

/** Delivery outcome echoed on a reply. */
export class ReplyDeliveryDto {
  @ApiProperty({ enum: MessageChannel, example: MessageChannel.EMAIL })
  channel: MessageChannel;

  @ApiProperty({ example: 'queued', enum: ['queued', 'failed'] })
  status: 'queued' | 'failed';
}

/** `POST /admin/leads/{reference}/reply` → 201 inner body (FR-LEAD-013). */
export class AdminReplyResultDto {
  @ApiProperty({ example: 'lm_9', format: 'uuid' })
  message_id: string;

  @ApiProperty({ type: ReplyDeliveryDto })
  delivery: ReplyDeliveryDto;
}

/** `POST /admin/leads/{reference}/notes` → 201 inner body (FR-LEAD-015). */
export class InternalNoteResultDto {
  @ApiProperty({ example: 'lm_10', format: 'uuid' })
  message_id: string;

  @ApiProperty({ example: true })
  is_internal_note: boolean;
}

/** `PATCH /admin/leads/{reference}/status` → 200 inner body (FR-LEAD-014). */
export class ChangeStatusResultDto {
  @ApiProperty({ example: 'HLP-20451' })
  reference: string;

  @ApiProperty({ enum: LeadStatus, example: LeadStatus.RESOLVED })
  status: LeadStatus;
}

/** `POST /admin/leads/{reference}/handoff-exchange` → 202 inner body (FR-LEAD-016). */
export class HandoffExchangeResultDto {
  @ApiProperty({ example: 'SO-100245' })
  order_reference: string;

  @ApiProperty({ example: 'exchange_initiated', enum: ['exchange_initiated', 'cancellation_initiated'] })
  handoff: 'exchange_initiated' | 'cancellation_initiated';

  @ApiProperty({ example: 'ex_1', nullable: true, description: 'ORD exchange id (null for a cancellation)' })
  exchange_id: string | null;

  @ApiProperty({ example: true })
  linked: boolean;
}
