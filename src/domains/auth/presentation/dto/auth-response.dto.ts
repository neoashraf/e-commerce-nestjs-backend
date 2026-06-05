import { ApiProperty } from '@nestjs/swagger';

export class OtpRequestResponseDto {
  @ApiProperty() challenge_id: string;
  @ApiProperty({ example: 300 }) expires_in: number;
  @ApiProperty({ example: 60 }) resend_after: number;
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

export class LoginResponseDto {
  @ApiProperty({ type: LoginCustomerDto }) customer: LoginCustomerDto;
  @ApiProperty({ type: AuthTokensDto }) tokens: AuthTokensDto;
}

export class VerifyEmailResponseDto {
  @ApiProperty({ example: true }) email_verified: boolean;
}
