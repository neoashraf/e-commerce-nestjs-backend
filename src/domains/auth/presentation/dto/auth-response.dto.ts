import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OtpRequestResponseDto {
  @ApiProperty() challenge_id: string;
  @ApiProperty({ example: 300 }) expires_in: number;
  @ApiProperty({ example: 60 }) resend_after: number;
  @ApiPropertyOptional({
    example: '123456',
    description: 'DEV-ONLY: the OTP code, returned only when OTP_DEV_RETURN=true and not in production.',
  })
  dev_otp?: string;
}

export class AuthTokensDto {
  @ApiProperty() access_token: string;
  @ApiProperty() refresh_token: string;
  @ApiProperty({ example: 900 }) expires_in: number;
}

export class CustomerSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() full_name: string;
  @ApiProperty({ example: '+8801712345678' }) phone: string;
  @ApiProperty() phone_verified: boolean;
}

export class VerifyOtpResponseDto {
  @ApiProperty() is_new_account: boolean;
  @ApiProperty({ type: CustomerSummaryDto }) customer: CustomerSummaryDto;
  @ApiProperty({ type: AuthTokensDto }) tokens: AuthTokensDto;
}

export class RefreshResponseDto {
  @ApiProperty() access_token: string;
  @ApiProperty() refresh_token: string;
  @ApiProperty({ example: 900 }) expires_in: number;
}

export class RegisteredCustomerDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'sabbir@example.com' }) email: string;
  @ApiProperty({ example: false }) email_verified: boolean;
}

export class RegisterResponseDto {
  @ApiProperty({ type: RegisteredCustomerDto }) customer: RegisteredCustomerDto;
  @ApiProperty({ type: AuthTokensDto }) tokens: AuthTokensDto;
}

export class LoginCustomerDto {
  @ApiProperty() id: string;
}

export class LoginMfaChallengeDto {
  @ApiProperty({ example: 'mfa_9f1c…' }) id: string;
  @ApiProperty({ enum: ['sms', 'email'], example: 'email' }) channel: string;
  @ApiProperty({ example: 's****r@example.com', description: 'Masked destination' }) sent_to: string;
  @ApiProperty({ example: 300 }) expires_in: number;
  @ApiProperty({ example: 60 }) resend_after: number;
}

/**
 * Email+password login response. When 2FA is required (FR-MFA-010) `mfa_required` is true and the
 * `pre_auth_token` + `challenge` + `available_channels` are returned instead of `customer`/`tokens`;
 * otherwise `customer` + `tokens` are returned and the MFA fields are absent.
 */
export class LoginResponseDto {
  @ApiPropertyOptional({ example: false }) mfa_required?: boolean;
  @ApiPropertyOptional({ type: LoginCustomerDto }) customer?: LoginCustomerDto;
  @ApiPropertyOptional({ type: AuthTokensDto }) tokens?: AuthTokensDto;
  @ApiPropertyOptional({ example: 'pat_3af9…', description: 'Short-lived login-continuation token' })
  pre_auth_token?: string;
  @ApiPropertyOptional({ type: LoginMfaChallengeDto }) challenge?: LoginMfaChallengeDto;
  @ApiPropertyOptional({ type: [String], example: ['email'] }) available_channels?: string[];
}

export class VerifyEmailResponseDto {
  @ApiProperty({ example: true }) email_verified: boolean;
}
