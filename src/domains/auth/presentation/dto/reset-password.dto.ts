import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiPropertyOptional({
    example: 'prt_9f1c...',
    description: 'Email path: single-use reset token from the email link',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  token?: string;

  @ApiPropertyOptional({
    example: 'otp_9f1c...',
    description: 'Phone path: OTP challenge id (requested with purpose=password_reset)',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  challenge_id?: string;

  @ApiPropertyOptional({ example: '482913', description: 'Phone path: OTP code' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  code?: string;

  @ApiProperty({
    example: 'newfooty2026',
    minLength: 8,
    description: 'New password (≥8 chars, at least one letter and one number)',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  new_password: string;
}
