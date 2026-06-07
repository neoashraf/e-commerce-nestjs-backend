import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import { CouponStatus, DiscountType, EligibilityScope } from '../../domain/promo-enums';

/** Create a coupon (contract: POST /admin/coupons). */
export class CreateCouponDto {
  @ApiProperty({ example: 'BOOT10', maxLength: 40 })
  @IsString() @IsNotEmpty() @MaxLength(40)
  code: string;

  @ApiPropertyOptional({ example: '10% off football boots', maxLength: 160 })
  @IsOptional() @IsString() @MaxLength(160)
  description?: string;

  @ApiProperty({ enum: DiscountType, example: DiscountType.PERCENTAGE })
  @IsEnum(DiscountType)
  discount_type: DiscountType;

  @ApiPropertyOptional({ example: '10.00', description: 'Percent (0–100) or fixed amount; ignored for free_shipping' })
  @IsOptional() @IsNumberString()
  value?: string;

  @ApiPropertyOptional({ example: '1000.00' })
  @IsOptional() @IsNumberString()
  max_discount_amount?: string;

  @ApiPropertyOptional({ example: '3000.00' })
  @IsOptional() @IsNumberString()
  min_order_subtotal?: string;

  @ApiPropertyOptional({ enum: EligibilityScope, example: EligibilityScope.ALL })
  @IsOptional() @IsEnum(EligibilityScope)
  eligibility_scope?: EligibilityScope;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  eligible_category_ids?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  eligible_product_ids?: string[];

  @ApiProperty({ example: '2026-06-05T00:00:00Z' })
  @IsString() @IsNotEmpty()
  starts_at: string;

  @ApiProperty({ example: '2026-06-20T23:59:59Z' })
  @IsString() @IsNotEmpty()
  ends_at: string;

  @ApiPropertyOptional({ example: 500, description: 'null = unlimited' })
  @IsOptional() @IsInt() @Min(0)
  total_usage_limit?: number;

  @ApiPropertyOptional({ example: 1, description: 'null = unlimited' })
  @IsOptional() @IsInt() @Min(0)
  per_customer_limit?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional() @IsBoolean()
  first_order_only?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional() @IsBoolean()
  is_active?: boolean;
}

/** Update a coupon (PATCH; all fields optional). */
export class UpdateCouponDto extends CreateCouponDto {
  @ApiPropertyOptional({ maxLength: 40 }) @IsOptional() @IsString() @MaxLength(40) override code: string;
  @ApiPropertyOptional({ enum: DiscountType }) @IsOptional() @IsEnum(DiscountType) override discount_type: DiscountType;
  @ApiPropertyOptional() @IsOptional() @IsString() override starts_at: string;
  @ApiPropertyOptional() @IsOptional() @IsString() override ends_at: string;
}

/** Coupon list query (contract: GET /admin/coupons). */
export class ListCouponsDto {
  @ApiPropertyOptional({ enum: CouponStatus })
  @IsOptional() @IsEnum(CouponStatus)
  status?: CouponStatus;

  @ApiPropertyOptional({ example: 'EID' })
  @IsOptional() @IsString()
  q?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @IsString()
  page?: string;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional() @IsString()
  limit?: string;
}

/** Coupon list row (contract data[]). */
export class CouponListRowDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() discount_type: string;
  @ApiProperty() value: string;
  @ApiProperty() starts_at: Date;
  @ApiProperty() ends_at: Date;
  @ApiProperty() total_used: number;
  @ApiProperty({ nullable: true }) total_usage_limit: number | null;
  @ApiProperty() is_active: boolean;
  @ApiProperty({ enum: CouponStatus }) status: CouponStatus;
}

/** Create-coupon response (contract: 201). */
export class CouponCreatedDto {
  @ApiProperty({ example: 'cp_9' }) id: string;
  @ApiProperty({ example: 'BOOT10' }) code: string;
}
