import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({ example: 'a3f1c2d4-...', description: 'challenge_id returned by /auth/otp/request' })
  @IsString()
  @IsNotEmpty()
  challenge_id: string;

  @ApiProperty({ example: '482913', description: '6-digit code' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be exactly 6 digits' })
  code: string;

  @ApiPropertyOptional({
    example: 'Sabbir Ahmed',
    description: 'Required only when the phone is new (registration)',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  full_name?: string;
}
