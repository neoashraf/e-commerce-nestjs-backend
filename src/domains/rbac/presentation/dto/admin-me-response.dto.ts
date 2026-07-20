import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminMeResponseDto {
  @ApiProperty({ example: 'ad_1' })
  id: string;

  @ApiProperty({ example: 'Ops Lead' })
  full_name: string;

  @ApiProperty({ example: 'ops@store.com' })
  email: string;

  @ApiProperty({ example: 'Order Manager' })
  role: string;

  @ApiPropertyOptional({ example: '+8801712345678', nullable: true })
  phone: string | null;

  @ApiProperty({ example: false, description: '2FA is opt-in for every admin incl. Super Admin.' })
  is_super_admin: boolean;

  @ApiProperty({ example: false, description: 'Whether the admin requires a 2FA code at login (email-only).' })
  two_fa_enabled: boolean;

  @ApiProperty({
    example: false,
    description:
      'Whether THIS session passed the 2FA step at login — the disable flow needs a fresh code when false (FR-RBAC-009).',
  })
  session_mfa_verified: boolean;

  @ApiProperty({
    type: [String],
    example: ['dashboard.view', 'orders.order.read', 'orders.order.refund'],
    description: 'Effective permission codes for the admin client to gate UI (FR-RBAC-032)',
  })
  permissions: string[];
}
