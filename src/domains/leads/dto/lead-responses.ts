import { ApiProperty } from '@nestjs/swagger';

import { LeadStatus, LeadType, MessageDirection } from '../leads.enums';

/** `POST /leads` → 201 inner body (the global interceptor wraps it in `{ data }`). */
export class SubmitLeadResultDto {
  @ApiProperty({ example: 'HLP-20451' })
  reference: string;

  @ApiProperty({ enum: LeadStatus, example: LeadStatus.NEW })
  status: LeadStatus;

  @ApiProperty({ example: true, description: 'Whether the NOTIF acknowledgement was accepted' })
  acknowledgement_sent: boolean;
}

/** `POST /leads/attachments` → 201 inner body. */
export class UploadAttachmentResultDto {
  @ApiProperty({ example: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' })
  attachment_id: string;

  @ApiProperty({ example: 'https://cdn.example.com/leads/3f2504e0.jpg' })
  url: string;

  @ApiProperty({ example: 'image/jpeg' })
  content_type: string;

  @ApiProperty({ example: 824133 })
  size_bytes: number;
}

/** Row of `GET /me/leads`. */
export class MyLeadListItemDto {
  @ApiProperty({ example: 'HLP-20451' })
  reference: string;

  @ApiProperty({ enum: LeadType, example: LeadType.CLAIM_RETURN })
  type: LeadType;

  @ApiProperty({ example: 'Wrong size delivered' })
  subject: string;

  @ApiProperty({ enum: LeadStatus, example: LeadStatus.AWAITING_CUSTOMER })
  status: LeadStatus;

  @ApiProperty({ example: '2026-06-04T09:00:00.000Z' })
  created_at: string;
}

/** One message in a customer-facing thread (internal notes excluded — BR-LEAD-7). */
export class ThreadMessageDto {
  @ApiProperty({ enum: MessageDirection, example: MessageDirection.INBOUND })
  direction: MessageDirection;

  @ApiProperty({ example: 'I ordered size 42 but received 43.' })
  body: string;

  @ApiProperty({ example: '2026-06-04T09:00:00.000Z' })
  created_at: string;
}

/** `GET /me/leads/{reference}` → inner body. */
export class MyLeadThreadDto {
  @ApiProperty({ example: 'HLP-20451' })
  reference: string;

  @ApiProperty({ enum: LeadType, example: LeadType.CLAIM_RETURN })
  type: LeadType;

  @ApiProperty({ enum: LeadStatus, example: LeadStatus.AWAITING_CUSTOMER })
  status: LeadStatus;

  @ApiProperty({ example: 'SO-100245', nullable: true })
  order_reference: string | null;

  @ApiProperty({ type: [ThreadMessageDto] })
  messages: ThreadMessageDto[];
}

/** `POST /me/leads/{reference}/reply` → 201 inner body. */
export class CustomerReplyResultDto {
  @ApiProperty({ example: 'HLP-20451' })
  reference: string;

  @ApiProperty({ enum: LeadStatus, example: LeadStatus.OPEN })
  status: LeadStatus;
}
