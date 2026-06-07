import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateLightweightDto {
  @ApiProperty({ example: 'Sabbir Ahmed', minLength: 2, maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  full_name: string;

  @ApiProperty({ example: '+8801712345678', description: 'BD mobile, normalized to E.164' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ example: 'sabbir@example.com', maxLength: 160 })
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional({ example: false, description: 'Promotional SMS consent (default opted-out)' })
  @IsOptional()
  @IsBoolean()
  promo_sms_opt_in?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Promotional email consent (default opted-out)' })
  @IsOptional()
  @IsBoolean()
  promo_email_opt_in?: boolean;
}
