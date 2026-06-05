import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class ClaimAccountDto {
  @ApiProperty({ example: 'otp_9f1c...', description: 'OTP challenge for the account phone (purpose: register)' })
  @IsString()
  @IsNotEmpty()
  challenge_id: string;

  @ApiProperty({ example: '204815' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({ example: 'footy2026', minLength: 8, description: 'Optional password to set on activation' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
