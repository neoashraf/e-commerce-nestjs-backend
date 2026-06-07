import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/** Shopper identity for per-customer cap + first-order checks (BR-PROMO-7/9). */
export class CouponIdentityDto {
  @ApiPropertyOptional({ example: 'c_77a1…', description: 'Registered customer UUID (if logged in).' })
  @IsOptional()
  @IsString()
  customer_id?: string | null;

  @ApiPropertyOptional({ example: '+8801712345678', description: 'Guest phone (E.164) for guest carts.' })
  @IsOptional()
  @IsString()
  guest_phone?: string | null;
}

/** One cart line with its effective (post-catalog-sale) unit price (BR-PROMO-10). */
export class CartLineDto {
  @ApiProperty({ example: 'c7a1…', description: 'Product UUID.' })
  @IsString()
  @IsNotEmpty()
  product_id: string;

  @ApiPropertyOptional({ example: 'cat_fb', description: 'Category UUID (for scope matching).' })
  @IsOptional()
  @IsString()
  category_id?: string | null;

  @ApiProperty({ example: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: '12500.00', description: 'Effective unit price (Decimal 12,2).' })
  @IsNumberString()
  effective_unit_price: string;
}

/** Cart payload for validation. */
export class CartDto {
  @ApiProperty({ type: CartLineDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartLineDto)
  lines: CartLineDto[];

  @ApiProperty({ example: '12500.00', description: 'Cart subtotal (Decimal 12,2).' })
  @IsNumberString()
  subtotal: string;
}

/** POST /internal/coupons/validate body. */
export class ValidateCouponDto {
  @ApiProperty({ example: 'EID500' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ type: CouponIdentityDto })
  @ValidateNested()
  @Type(() => CouponIdentityDto)
  identity: CouponIdentityDto;

  @ApiProperty({ type: CartDto })
  @ValidateNested()
  @Type(() => CartDto)
  cart: CartDto;
}

/** POST /internal/coupons/redeem body. */
export class RedeemCouponDto {
  @ApiProperty({ example: 'EID500' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'ord_88…', description: 'Order UUID the redemption is recorded against.' })
  @IsString()
  @IsNotEmpty()
  order_id: string;

  @ApiProperty({ type: CouponIdentityDto })
  @ValidateNested()
  @Type(() => CouponIdentityDto)
  identity: CouponIdentityDto;

  @ApiProperty({ example: '500.00', description: 'Discount amount applied at checkout (Decimal 12,2).' })
  @IsNumberString()
  discount_amount: string;
}

/** POST /internal/coupons/reverse body. */
export class ReverseCouponDto {
  @ApiProperty({ example: 'ord_88…', description: 'Order UUID whose redemption to reverse.' })
  @IsString()
  @IsNotEmpty()
  order_id: string;
}

// --- response DTOs (Swagger documentation only) ---

export class ValidateResultDto {
  @ApiProperty({ example: true })
  valid: boolean;

  @ApiPropertyOptional({ example: { code: 'EID500', discount_type: 'fixed' } })
  coupon?: { code: string; discount_type: string };

  @ApiPropertyOptional({ example: '12500.00' })
  eligible_subtotal?: string;

  @ApiPropertyOptional({ example: '500.00' })
  discount_amount?: string;

  @ApiPropertyOptional({ example: false })
  free_shipping?: boolean;

  @ApiPropertyOptional({ example: 'min_order_not_met' })
  reason?: string;

  @ApiPropertyOptional({ example: 'Minimum order ৳2,000 required.' })
  message?: string;
}

export class RedeemResultDto {
  @ApiProperty({ example: true })
  redeemed: boolean;

  @ApiProperty({ example: 'rdm_5' })
  redemption_id: string;

  @ApiPropertyOptional({ example: true })
  already_applied?: boolean;
}

export class ReverseResultDto {
  @ApiProperty({ example: true })
  reversed: boolean;
}
