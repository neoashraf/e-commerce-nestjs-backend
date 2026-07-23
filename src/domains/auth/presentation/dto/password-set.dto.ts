import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

/** Body for POST /me/password/set — one of (challenge_id + code) or set_token. */
export class SetPasswordDto {
  @ApiPropertyOptional({ example: 'otp_9f2c…', description: 'OTP path: the challenge id' })
  @IsOptional()
  @IsString()
  challenge_id?: string;

  @ApiPropertyOptional({ example: '482913', description: 'OTP path: the code received by SMS' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({
    example: 'pst_5f8a…',
    description: 'Freshness path (FR-AUTH-037): single-use token from set/request',
  })
  @IsOptional()
  @IsString()
  set_token?: string;

  @ApiProperty({ example: 'footy2026', minLength: 8 })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  new_password: string;
}

/** Response for POST /me/password/set/request — OTP variant or freshness variant. */
export class PasswordSetRequestResponseDto {
  @ApiProperty({ example: true, description: 'false when the freshness window applied' })
  otp_required: boolean;

  @ApiPropertyOptional({ example: 'otp_9f2c…', description: 'Present when otp_required = true' })
  challenge_id?: string;

  @ApiProperty({ example: 300, description: 'OTP or set_token lifetime in seconds' })
  expires_in: number;

  @ApiPropertyOptional({ example: 60, description: 'Present when otp_required = true' })
  resend_after?: number;

  @ApiPropertyOptional({ example: 'pst_5f8a…', description: 'Present when otp_required = false' })
  set_token?: string;

  @ApiPropertyOptional({
    example: '482913',
    description: 'DEV-ONLY echo of the OTP (no SMS gateway in dev); never present in production',
  })
  dev_otp?: string;
}
