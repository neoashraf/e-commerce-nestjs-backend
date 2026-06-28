import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import {
  OrderPaymentMethod,
  OrderPaymentState,
  OrderStatus,
} from '../../domain/order-enums';

/** Query filters for `GET /admin/orders` (FR-ORD-070; contract: Admin — List/search orders). */
export class ListAdminOrdersQueryDto {
  @ApiPropertyOptional({
    description: "A registered buyer's id — restricts to their linked orders (Customer 360); with `phone` also includes guest orders under that phone.",
  })
  @IsOptional()
  @IsString()
  customer_id?: string;

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ enum: OrderPaymentState })
  @IsOptional()
  @IsEnum(OrderPaymentState)
  payment_state?: OrderPaymentState;

  @ApiPropertyOptional({ description: 'Search by order number (partial, case-insensitive)' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Filter by buyer / recipient phone (partial match)' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: '2026-06-01', description: 'Placed-at lower bound (inclusive)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-06-04', description: 'Placed-at upper bound (inclusive)' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 50, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** Buyer summary on an admin order row (snapshot name + phone). */
export class AdminOrderCustomerDto {
  @ApiProperty({ example: 'Sabbir Ahmed' }) name: string;
  @ApiProperty({ example: '+8801712345678' }) phone: string;
}

/** One row in the admin order list (contract: Admin — List/search orders). */
export class AdminOrderRowDto {
  @ApiProperty({ example: 'SO-100245' }) order_no: string;
  @ApiProperty({ type: AdminOrderCustomerDto }) customer: AdminOrderCustomerDto;
  @ApiProperty({ enum: OrderStatus }) status: OrderStatus;
  @ApiProperty({ enum: OrderPaymentMethod }) payment_method: OrderPaymentMethod;
  @ApiProperty({ enum: OrderPaymentState }) payment_state: OrderPaymentState;
  @ApiProperty({ example: '12241.20' }) grand_total: string;
  @ApiProperty({ example: '2026-06-03T10:00:00Z' }) placed_at: string;
}
