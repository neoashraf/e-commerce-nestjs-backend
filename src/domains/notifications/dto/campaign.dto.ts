import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/** A single campaign recipient. At least one addressable field should be present per channel. */
export class CampaignRecipientDto {
  @ApiPropertyOptional() @IsOptional() @IsString() customer_id?: string;
  @ApiPropertyOptional({ example: '+8801712345678' }) @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional({ example: 'a@b.com' }) @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional({ description: 'Recipient name merged into the {{name}} placeholder' })
  @IsOptional()
  @IsString()
  name?: string;
}

/**
 * Trigger a promotional campaign (FR-NOTIF-051–053, §7.3). Reuses the dispatch core per recipient with
 * `event_type` defaulting to `promo.campaign`; `recipient_source = all_opted_in` pulls the opted-in set
 * from the AUTH seam instead of an explicit list.
 */
export class CampaignSendDto {
  @ApiPropertyOptional({ default: 'promo.campaign' })
  @IsOptional()
  @IsString()
  event_type?: string;

  @ApiPropertyOptional({ example: 'bn', default: 'bn' })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiProperty({ enum: ['sms', 'email'], isArray: true, example: ['sms', 'email'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['sms', 'email'], { each: true })
  channels: Array<'sms' | 'email'>;

  @ApiPropertyOptional({ enum: ['explicit', 'all_opted_in'], default: 'explicit' })
  @IsOptional()
  @IsIn(['explicit', 'all_opted_in'])
  recipient_source?: 'explicit' | 'all_opted_in';

  @ApiPropertyOptional({ type: [CampaignRecipientDto], description: 'Required when recipient_source=explicit' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CampaignRecipientDto)
  recipients?: CampaignRecipientDto[];

  @ApiPropertyOptional({ example: { offer: '20% off boots', cta_url: 'https://shop.bd/sale' } })
  @IsOptional()
  @IsObject()
  variables?: Record<string, string | number>;

  @ApiPropertyOptional({ description: 'Idempotency key prefix; one key derived per recipient' })
  @IsOptional()
  @IsString()
  idempotency_prefix?: string;
}

/** Dry-run a campaign to preview reach (§7.3). Same shape as the send request. */
export class CampaignDryRunDto extends CampaignSendDto {}

/** Eligibility counts returned by the dry-run, and the post-send tally for an actual send. */
export class CampaignSummaryDto {
  @ApiProperty() total: number;
  @ApiProperty() eligible: number;
  @ApiProperty() opted_out: number;
  @ApiProperty() quiet_hours_deferred: number;
  @ApiProperty() rate_limited: number;
  @ApiProperty({ description: 'Recipients whose SMS is blocked for lack of an active bn template' })
  blocked_no_bn: number;
  @ApiProperty({ description: 'Estimated total SMS segments across eligible SMS recipients' })
  estimated_sms_segments: number;
}

export class CampaignSendResultDto {
  @ApiProperty() event_type: string;
  @ApiProperty({ description: 'Notifications actually queued/sent (excludes suppressed/deferred)' })
  sent: number;
  @ApiProperty({ description: 'Notifications deferred to after quiet hours' })
  deferred: number;
  @ApiProperty() suppressed: number;
  @ApiProperty({ type: CampaignSummaryDto }) summary: CampaignSummaryDto;
}
