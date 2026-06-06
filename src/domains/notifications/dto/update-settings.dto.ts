import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** HH:MM 24-hour clock (e.g. `22:00`). */
const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Masked sender IDs: alphanumeric, ≤11 chars, BTRC/SRS §11. */
const MASKED_SENDER_ID = /^[A-Za-z0-9]{1,11}$/;

export class SmsSettingsDto {
  @ApiPropertyOptional({ example: 'ssl_wireless' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  provider_name?: string;

  @ApiPropertyOptional({ example: 'SportShop', description: 'Pre-approved masked sender ID (alphanumeric, ≤11 chars)' })
  @IsOptional()
  @IsString()
  @MaxLength(11, { message: 'masked_sender_id must be at most 11 characters' })
  @Matches(MASKED_SENDER_ID, { message: 'masked_sender_id must be alphanumeric and ≤11 characters' })
  masked_sender_id?: string;

  @ApiPropertyOptional({ example: '8801XXXXXXXXX' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  non_masking_sender?: string;

  @ApiPropertyOptional({ example: 'secret://sms/ssl_wireless', description: 'Pointer to the stored secret; raw credentials are never accepted/returned here' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  credentials_ref?: string;

  @ApiPropertyOptional({ example: '22:00' })
  @IsOptional()
  @IsString()
  @Matches(TIME_HHMM, { message: 'quiet_hours_start must be HH:MM (24-hour)' })
  quiet_hours_start?: string;

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @IsString()
  @Matches(TIME_HHMM, { message: 'quiet_hours_end must be HH:MM (24-hour)' })
  quiet_hours_end?: string;
}

export class EmailSettingsDto {
  @ApiPropertyOptional({ example: 'smtp_relay' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  provider_name?: string;

  @ApiPropertyOptional({ example: 'noreply@sportshop.com.bd' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  transactional_from?: string;

  @ApiPropertyOptional({ example: 'secret://email/smtp' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  credentials_ref?: string;
}

/**
 * Update channel provider settings (FR-NOTIF-063). Each channel object is optional; only the
 * channels present are updated, and within a channel only the provided fields change. Raw
 * credentials are never accepted — only the `credentials_ref` pointer (NFR security).
 */
export class UpdateSettingsDto {
  @ApiPropertyOptional({ type: SmsSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SmsSettingsDto)
  sms?: SmsSettingsDto;

  @ApiPropertyOptional({ type: EmailSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmailSettingsDto)
  email?: EmailSettingsDto;
}
