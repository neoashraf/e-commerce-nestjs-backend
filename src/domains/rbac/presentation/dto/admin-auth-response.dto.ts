import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminTokensDto {
  @ApiProperty({ example: 'eyJ…' })
  access_token: string;

  @ApiProperty({ example: 'rt_9a8b…' })
  refresh_token: string;

  @ApiProperty({ example: 900, description: 'Access-token lifetime in seconds' })
  expires_in: number;
}

export class AdminSummaryDto {
  @ApiProperty({ example: 'ad_1' })
  id: string;

  @ApiPropertyOptional({ example: 'Ops Lead' })
  full_name?: string;

  @ApiProperty({ example: 'Order Manager' })
  role: string;
}

/** Login response — either an issued session, or a pending 2FA challenge. */
export class AdminLoginResponseDto {
  @ApiPropertyOptional({ type: AdminSummaryDto })
  admin?: AdminSummaryDto;

  @ApiPropertyOptional({ type: AdminTokensDto })
  tokens?: AdminTokensDto;

  @ApiPropertyOptional({ example: true, description: 'Present when a second factor is required' })
  twofa_required?: boolean;

  @ApiPropertyOptional({ example: 'otp_5f3c…' })
  challenge_id?: string;

  @ApiPropertyOptional({ example: 'sms', enum: ['sms', 'email'] })
  channel?: string;

  @ApiPropertyOptional({ example: 300, description: '2FA code lifetime in seconds' })
  expires_in?: number;
}

export class AdminVerify2faResponseDto {
  @ApiProperty({ type: AdminSummaryDto })
  admin: AdminSummaryDto;

  @ApiProperty({ type: AdminTokensDto })
  tokens: AdminTokensDto;
}

export class AdminRefreshResponseDto {
  @ApiProperty({ example: 'eyJ…' })
  access_token: string;

  @ApiProperty({ example: 'rt_9a8b…' })
  refresh_token: string;

  @ApiProperty({ example: 900 })
  expires_in: number;
}
