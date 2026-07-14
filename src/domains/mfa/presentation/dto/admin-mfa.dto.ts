import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { MfaEnforcement } from '../../domain/enums/mfa-enforcement.enum';

export class UpdateMfaPolicyDto {
  @ApiPropertyOptional({ example: true, description: 'Offer the SMS channel (needs a gateway)' })
  @IsOptional()
  @IsBoolean()
  sms_enabled?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Offer the email channel (default on)' })
  @IsOptional()
  @IsBoolean()
  email_enabled?: boolean;

  @ApiPropertyOptional({ enum: MfaEnforcement, example: MfaEnforcement.OPTIONAL })
  @IsOptional()
  @IsEnum(MfaEnforcement)
  enforcement_mode?: MfaEnforcement;

  @ApiPropertyOptional({ example: 300, minimum: 60, maximum: 3600 })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(3600)
  otp_ttl_seconds?: number;

  @ApiPropertyOptional({ example: 60, minimum: 15, maximum: 600 })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(600)
  resend_cooldown_seconds?: number;

  @ApiPropertyOptional({ example: 5, minimum: 3, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(10)
  max_attempts?: number;
}
