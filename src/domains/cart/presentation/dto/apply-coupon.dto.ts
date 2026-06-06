import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** POST /cart/coupon body (FR-CART-020). */
export class ApplyCouponDto {
  @ApiProperty({ example: 'EID500', maxLength: 40 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  code: string;
}
