import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

import { Gender } from '../../domain/enums/gender.enum';

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

  @ApiPropertyOptional({ example: 'new@example.com', description: 'Changing this re-triggers email verification' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  promo_sms_opt_in?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  promo_email_opt_in?: boolean;
}
