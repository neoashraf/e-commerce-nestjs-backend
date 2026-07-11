import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MfaChallengeDto {
  @ApiProperty({ example: 'mfa_9f1c…' }) id: string;
  @ApiProperty({ enum: ['sms', 'email'], example: 'email' }) channel: string;
  @ApiProperty({ example: 's****r@example.com', description: 'Masked destination' }) sent_to: string;
  @ApiProperty({ example: 300 }) expires_in: number;
  @ApiProperty({ example: 60 }) resend_after: number;
}

/** Response wrapper for resend / channel-switch — a fresh challenge. */
export class MfaChallengeResponseDto {
  @ApiProperty({ type: MfaChallengeDto }) challenge: MfaChallengeDto;
}

export class MfaTokensDto {
  @ApiProperty() access_token: string;
  @ApiProperty() refresh_token: string;
  @ApiProperty({ example: 900 }) expires_in: number;
}

export class MfaVerifyCustomerDto {
  @ApiProperty() id: string;
}

export class MfaVerifyResponseDto {
  @ApiProperty({ type: MfaVerifyCustomerDto }) customer: MfaVerifyCustomerDto;
  @ApiProperty({ type: MfaTokensDto }) tokens: MfaTokensDto;
}

export class MfaPolicyView {
  @ApiProperty({ example: 'optional', enum: ['optional', 'mandatory'] }) enforcement_mode: string;
  @ApiProperty({ type: [String], example: ['email'] }) available_channels: string[];
}

export class MyMfaResponseDto {
  @ApiProperty({ example: false }) enabled: boolean;
  @ApiPropertyOptional({ example: 'email', nullable: true }) preferred_channel: string | null;
  @ApiProperty({ type: MfaPolicyView }) policy: MfaPolicyView;
  @ApiProperty({ type: [String], example: ['email'] }) eligible_channels: string[];
}

export class EnableMfaVerificationDto {
  @ApiProperty({ example: 'mfa_c2d3…' }) challenge_id: string;
  @ApiProperty({ enum: ['sms', 'email'], example: 'email' }) channel: string;
  @ApiProperty({ example: 's****r@example.com' }) sent_to: string;
  @ApiProperty({ example: 300 }) expires_in: number;
}

export class EnableMfaResponseDto {
  @ApiProperty({ type: EnableMfaVerificationDto }) verification: EnableMfaVerificationDto;
}

export class ConfirmEnableResponseDto {
  @ApiProperty({ example: true }) enabled: boolean;
  @ApiProperty({ example: 'email' }) preferred_channel: string;
  @ApiProperty({ example: '2026-07-09T10:00:00Z' }) enabled_at: string;
}

export class DisableMfaResponseDto {
  @ApiProperty({ example: false }) enabled: boolean;
}

export class PreferredChannelResponseDto {
  @ApiProperty({ example: 'sms' }) preferred_channel: string;
}

export class MfaPolicyResponseDto {
  @ApiProperty({ example: false }) sms_enabled: boolean;
  @ApiProperty({ example: true }) email_enabled: boolean;
  @ApiProperty({ example: 'optional', enum: ['optional', 'mandatory'] }) enforcement_mode: string;
  @ApiProperty({ example: 300 }) otp_ttl_seconds: number;
  @ApiProperty({ example: 60 }) resend_cooldown_seconds: number;
  @ApiProperty({ example: 5 }) max_attempts: number;
  @ApiPropertyOptional({ nullable: true }) updated_by: string | null;
  @ApiProperty({ example: '2026-07-09T09:00:00Z' }) updated_at: string;
}
