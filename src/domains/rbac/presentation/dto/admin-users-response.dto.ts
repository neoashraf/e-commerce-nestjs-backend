import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';

export class AdminUserListItemDto {
  @ApiProperty({ example: 'ad_1' })
  id: string;

  @ApiProperty({ example: 'Ops Lead' })
  full_name: string;

  @ApiProperty({ example: 'ops@store.com' })
  email: string;

  @ApiProperty({ example: 'role_order_mgr' })
  role_id: string;

  @ApiProperty({ example: 'Order Manager' })
  role: string;

  @ApiProperty({ enum: AdminUserStatus })
  status: AdminUserStatus;

  @ApiPropertyOptional({ example: '2026-06-03T09:12:00Z', nullable: true })
  last_login_at: string | null;
}

export class InviteAdminUserResponseDto {
  @ApiProperty({ example: 'ad_9' })
  id: string;

  @ApiProperty({ enum: AdminUserStatus, example: AdminUserStatus.PENDING })
  status: AdminUserStatus;

  @ApiProperty({ example: true })
  invite_sent: boolean;
}

export class UpdateAdminUserResponseDto {
  @ApiProperty({ example: 'ad_9' })
  id: string;

  @ApiProperty({ example: 'Catalog Manager' })
  role: string;
}

export class AdminUserStatusResponseDto {
  @ApiProperty({ example: 'ad_9' })
  id: string;

  @ApiProperty({ enum: AdminUserStatus })
  status: AdminUserStatus;
}

export class ResendInviteResponseDto {
  @ApiProperty({ example: 'ad_9' })
  id: string;

  @ApiProperty({ example: true })
  invite_sent: boolean;
}
