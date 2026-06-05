import { ApiProperty } from '@nestjs/swagger';

export class AdminMeResponseDto {
  @ApiProperty({ example: 'ad_1' })
  id: string;

  @ApiProperty({ example: 'Ops Lead' })
  full_name: string;

  @ApiProperty({ example: 'ops@store.com' })
  email: string;

  @ApiProperty({ example: 'Order Manager' })
  role: string;

  @ApiProperty({
    type: [String],
    example: ['dashboard.view', 'orders.order.read', 'orders.order.refund'],
    description: 'Effective permission codes for the admin client to gate UI (FR-RBAC-032)',
  })
  permissions: string[];
}
