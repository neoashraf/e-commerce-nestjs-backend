import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Sabbir Ahmed' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 120)
  full_name: string;

  @ApiProperty({ example: 'sabbir@example.com' })
  @IsEmail()
  @MaxLength(160)
  email: string;

  @ApiProperty({ example: 'footy2026', description: '≥8 chars, ≥1 letter, ≥1 number' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({ default: false, description: 'Promotional email consent' })
  @IsOptional()
  @IsBoolean()
  promo_email_opt_in?: boolean;
}
