import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

import { Gender } from '../../domain/enums/gender.enum';

// NOTE (2026-07-19): `email` is intentionally ABSENT (amended contract 01, FR-AUTH-041).
// Email add/change goes through POST /me/email/change/request|confirm (verify-before-attach);
// with `forbidNonWhitelisted` on, a request still sending `email` here is rejected with 400.

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Sabbir A.', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  full_name?: string;

  @ApiPropertyOptional({ enum: Gender, example: Gender.MALE })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: '1995-03-12', description: 'ISO date (YYYY-MM-DD); age must be ≥ 13' })
  @IsOptional()
  @IsISO8601()
  date_of_birth?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  promo_sms_opt_in?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  promo_email_opt_in?: boolean;
}
