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

  @ApiProperty({ example: false, description: 'Super Admin → 2FA is mandatory (toggle locked on).' })
  is_super_admin: boolean;

  @ApiProperty({ example: false, description: 'Whether the admin requires a 2FA code at login.' })
  two_fa_enabled: boolean;

  @ApiPropertyOptional({ example: 'sms', nullable: true, description: '2FA delivery channel when enabled.' })
  two_fa_channel: string | null;

  @ApiProperty({
    type: [String],
    example: ['dashboard.view', 'orders.order.read', 'orders.order.refund'],
    description: 'Effective permission codes for the admin client to gate UI (FR-RBAC-032)',
  })
  permissions: string[];
}
