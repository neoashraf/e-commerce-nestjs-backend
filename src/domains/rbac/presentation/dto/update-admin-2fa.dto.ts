import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// NOTE (2026-07-19): the `channel` field is retired — admin 2FA is email-only (FR-RBAC-002).
// With `forbidNonWhitelisted` on, a request still sending `channel` is rejected with 400.
export class UpdateAdmin2faDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ example: 'S3cret-Pass', description: 'Re-authentication (required to enable or disable)' })
  @IsString()
  @IsNotEmpty()
  current_password: string;

  @ApiPropertyOptional({
    example: '482913',
    description:
      'Disable only: fresh emailed code — required when the session did not pass the 2FA step at login (FR-RBAC-009). Omit to have a code sent.',
  })
  @IsOptional()
  @IsString()
  code?: string;
}

export class ConfirmAdmin2faDto {
  @ApiProperty({ example: 'otp_9f2c…', description: 'Challenge id from the enable response' })
  @IsString()
  @IsNotEmpty()
  challenge_id: string;

  @ApiProperty({ example: '204815', description: 'Code received at the account email' })
  @IsString()
  @IsNotEmpty()
  code: string;
}
