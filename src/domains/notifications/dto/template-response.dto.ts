import { ApiProperty } from '@nestjs/swagger';

/** One row in the template list (contract: Templates — GET). */
export class TemplateRowDto {
  @ApiProperty({ example: 'tpl_1' })
  id: string;

  @ApiProperty({ example: 'order.shipped' })
  event_type: string;

  @ApiProperty({ example: 'sms' })
  channel: string;

  @ApiProperty({ example: 'bn' })
  locale: string;

  @ApiProperty({ example: 3 })
  version: number;

  @ApiProperty({ example: true })
  is_active: boolean;
}

/** List meta — surfaces promotional events lacking an active `bn` SMS template (FR-NOTIF-013). */
export class TemplateListMetaDto {
  @ApiProperty({
    type: [String],
    example: ['promo.campaign'],
    description: 'Promotional event types without an active bn SMS template (FE warns the marketer)',
  })
  promotional_missing_bn_sms: string[];
}

export class TemplateListResponseDto {
  @ApiProperty({ type: [TemplateRowDto] })
  data: TemplateRowDto[];

  @ApiProperty({ type: TemplateListMetaDto })
  meta: TemplateListMetaDto;
}

export class CreateTemplateResultDto {
  @ApiProperty({ example: 'tpl_9' })
  id: string;

  @ApiProperty({ example: 1 })
  version: number;

  @ApiProperty({ example: true })
  is_active: boolean;
}

export class CreateTemplateResponseDto {
  @ApiProperty({ type: CreateTemplateResultDto })
  data: CreateTemplateResultDto;
}

export class UpdateTemplateResultDto {
  @ApiProperty({ example: 'tpl_9' })
  id: string;

  @ApiProperty({ example: 2 })
  version: number;
}

export class UpdateTemplateResponseDto {
  @ApiProperty({ type: UpdateTemplateResultDto })
  data: UpdateTemplateResultDto;
}

export class PreviewResultDto {
  @ApiProperty({ example: null, nullable: true })
  rendered_subject: string | null;

  @ApiProperty({ example: 'প্রিয় Sabbir, আপনার অর্ডার SO-100245 …' })
  rendered_body: string;

  @ApiProperty({ example: 'unicode', enum: ['gsm7', 'unicode'], nullable: true, description: 'SMS encoding (null for email)' })
  encoding: 'gsm7' | 'unicode' | null;

  @ApiProperty({ example: 2, nullable: true, description: 'SMS segment count (null for email)' })
  sms_segments: number | null;
}

export class PreviewResponseDto {
  @ApiProperty({ type: PreviewResultDto })
  data: PreviewResultDto;
}
