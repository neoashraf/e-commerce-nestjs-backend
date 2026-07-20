import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAdminMeResponseDto {
  @ApiProperty({ example: 'ad_1' })
  id: string;

  @ApiProperty({ example: 'Ops Lead' })
  full_name: string;

  @ApiPropertyOptional({ example: '+8801712345678', nullable: true })
  phone: string | null;
}

export class AdminMessageResponseDto {
  @ApiProperty({ example: 'Password changed.' })
  message: string;
}

export class Twofa2faVerificationDto {
  @ApiProperty({ example: 'otp_9f2c…' })
  challenge_id: string;

  @ApiProperty({ example: 'o**@store.com', description: 'Masked account email' })
  sent_to: string;

  @ApiProperty({ example: 300 })
  expires_in: number;

  @ApiProperty({ example: 60 })
  resend_after: number;
}

export class Update2faResponseDto {
  @ApiProperty({
    example: false,
    description: 'Current state — enable activates only after POST /admin/me/2fa/confirm',
  })
  two_fa_enabled: boolean;

  @ApiPropertyOptional({
    type: Twofa2faVerificationDto,
    description: 'Present when a code was just emailed (enable start, or disable needing a code)',
  })
  verification?: Twofa2faVerificationDto;
}

export class Confirm2faResponseDto {
  @ApiProperty({ example: true })
  two_fa_enabled: boolean;
}
