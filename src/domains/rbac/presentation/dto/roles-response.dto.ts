import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PermissionCatalogItemDto {
  @ApiProperty({ example: 'catalog.product.create' })
  code: string;

  @ApiProperty({ example: 'CAT' })
  module: string;

  @ApiProperty({ example: 'Create products' })
  description: string;
}

export class RoleListItemDto {
  @ApiProperty({ example: 'role_order_mgr' })
  id: string;

  @ApiProperty({ example: 'Order Manager' })
  name: string;

  @ApiProperty({ example: true })
  is_system: boolean;

  @ApiProperty({ example: 3 })
  assigned_count: number;

  @ApiProperty({ example: 7, description: "Number of permissions, or 'all' for Super Admin" })
  permission_count: number | 'all';
}

export class RoleDetailDto {
  @ApiProperty({ example: 'role_order_mgr' })
  id: string;

  @ApiProperty({ example: 'Order Manager' })
  name: string;

  @ApiPropertyOptional({ example: 'Fulfilment-facing operations', nullable: true })
  description: string | null;

  @ApiProperty({ example: true })
  is_system: boolean;

  @ApiProperty({ example: '2026-06-03T10:02:00.000Z' })
  updated_at: string;

  @ApiProperty({ example: ['dashboard.view', 'orders.order.read'], type: [String] })
  permissions: string[];
}

export class CreateRoleResponseDto {
  @ApiProperty({ example: 'role_jr_cat' })
  id: string;

  @ApiProperty({ example: 'Junior Catalog' })
  name: string;
}

export class UpdateRoleResponseDto {
  @ApiProperty({ example: 'role_jr_cat' })
  id: string;

  @ApiProperty({ example: 4 })
  permission_count: number;
}
