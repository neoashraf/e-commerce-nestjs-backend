import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { LeadSource, LeadType } from '../leads.enums';

const BD_MOBILE = /^\+8801[3-9]\d{8}$/;

/**
 * `POST /leads` request (FR-LEAD-001–007; §11 validation). Field names are snake_case to match the API
 * contract. `order_reference` is required for `claim_return` and `attachment_ids` are accepted only for
 * `claim_return` — both enforced in the service (400 / 422). `honeypot` is an anti-bot trap (must stay
 * empty) and is intentionally accepted so `forbidNonWhitelisted` doesn't reject a real bot's payload.
 */
export class SubmitLeadDto {
  @ApiProperty({ enum: LeadType, example: LeadType.CLAIM_RETURN })
  @IsEnum(LeadType)
  type: LeadType;

  @ApiProperty({ example: 'Wrong size delivered', maxLength: 160 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  subject: string;

  @ApiProperty({ example: 'I ordered size 42 but received 43.', minLength: 1, maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message: string;

  @ApiProperty({ example: 'Sabbir Ahmed', minLength: 2, maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  submitter_name: string;

  @ApiProperty({ example: '+8801712345678', description: 'Bangladesh mobile (+8801XXXXXXXXX)' })
  @IsString()
  @Matches(BD_MOBILE, { message: 'submitter_phone must be a valid Bangladesh mobile number' })
  submitter_phone: string;

  @ApiPropertyOptional({ example: 'sabbir@example.com', maxLength: 160 })
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  submitter_email?: string;

  @ApiPropertyOptional({ example: 'SO-100245', maxLength: 40, description: 'Required for claim_return' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  order_reference?: string;

  @ApiPropertyOptional({ example: null, description: 'Linked product (product questions)' })
  @IsOptional()
  @IsUUID()
  product_id?: string;

  @ApiPropertyOptional({ enum: LeadSource, example: LeadSource.GET_HELP, default: LeadSource.GET_HELP })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @ApiPropertyOptional({
    type: [String],
    example: ['3f2504e0-4f89-41d3-9a0c-0305e82c3301'],
    description: 'Uploaded attachment ids (claim_return only; ≤ 5)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID('all', { each: true })
  attachment_ids?: string[];

  @ApiPropertyOptional({ example: '03AGdBq…', description: 'CAPTCHA token (spam protection)' })
  @IsOptional()
  @IsString()
  captcha_token?: string;

  @ApiPropertyOptional({ example: '', description: 'Anti-bot honeypot — must be left empty' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  honeypot?: string;
}
