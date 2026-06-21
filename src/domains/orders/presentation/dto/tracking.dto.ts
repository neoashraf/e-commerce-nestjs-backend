import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

import {
  OrderDeliveryZone,
  OrderPaymentMethod,
  OrderPaymentState,
  OrderStatus,
} from '../../domain/order-enums';

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/** Pagination query for `GET /me/orders` (FR-ORD-060). */
export class OrderHistoryQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

/** Body for the public guest tracking lookup `POST /orders/track` (FR-ORD-061). */
export class GuestTrackDto {
  @ApiProperty({ example: 'SO-100245' })
  @IsString()
  @IsNotEmpty()
  order_no!: string;

  @ApiProperty({ example: '+8801712345678', description: 'The phone on the order (E.164).' })
  @IsString()
  @Matches(/^\+?8801[3-9]\d{8}$/, { message: 'phone must be a valid Bangladeshi mobile number' })
  phone!: string;
}

// ---------------------------------------------------------------------------
// Responses (Swagger shapes — snake_case to match the contract)
// ---------------------------------------------------------------------------

/** One summary row in `GET /me/orders` (FR-ORD-060). */
export class OrderSummaryDto {
  @ApiProperty({ example: 'SO-100245' })
  order_no!: string;

  @ApiProperty({ example: '2026-06-03T10:00:00Z' })
  placed_at!: string;

  @ApiProperty({ enum: OrderStatus, example: OrderStatus.SHIPPED })
  status!: OrderStatus;

  @ApiProperty({ enum: OrderPaymentMethod, example: OrderPaymentMethod.BKASH })
  payment_method!: OrderPaymentMethod;

  @ApiProperty({ enum: OrderPaymentState, example: OrderPaymentState.PAID })
  payment_state!: OrderPaymentState;

  @ApiProperty({ example: '12241.20' })
  grand_total!: string;

  @ApiProperty({ example: 1 })
  item_count!: number;
}

export class OrderAddressDto {
  @ApiProperty({ example: 'Sabbir Ahmed' })
  recipient_name!: string;

  @ApiProperty({ example: '+8801712345678' })
  recipient_phone!: string;

  @ApiProperty({ example: 'House 12, Road 5, Dhanmondi' })
  address_line!: string;

  @ApiPropertyOptional({ example: 'Dhanmondi', nullable: true })
  area?: string | null;

  @ApiPropertyOptional({ example: 'Dhaka', nullable: true })
  district?: string | null;

  @ApiPropertyOptional({ example: 'Dhaka', nullable: true })
  division?: string | null;

  @ApiPropertyOptional({ example: '1209', nullable: true })
  postal_code?: string | null;
}

export class OrderItemLineDto {
  @ApiProperty({ example: 'Adidas Predator Elite' })
  product_title!: string;

  @ApiPropertyOptional({ example: 'অ্যাডিডাস প্রিডেটর এলিট', nullable: true, description: 'Bangla product title (RW6); null when unset.' })
  product_title_bn?: string | null;

  @ApiPropertyOptional({ example: 'https://cdn/listing.webp', nullable: true, description: 'Listing-rendition thumbnail (RW6); null when none.' })
  product_image?: string | null;

  @ApiProperty({ example: 'PRED-BLK-42' })
  sku_code!: string;

  @ApiProperty({ example: { color: 'Black', size: '42' }, type: 'object', additionalProperties: { type: 'string' } })
  variant_options!: Record<string, string>;

  @ApiProperty({ example: '12500.00' })
  unit_price!: string;

  @ApiProperty({ example: 1 })
  quantity!: number;

  @ApiProperty({ example: '12500.00' })
  line_total!: string;
}

export class OrderAmountsDto {
  @ApiProperty({ example: '12500.00' })
  subtotal!: string;

  @ApiProperty({ example: '500.00' })
  discount!: string;

  @ApiProperty({ example: '120.00' })
  delivery_charge!: string;

  @ApiProperty({ example: '121.20' })
  cod_surcharge!: string;

  @ApiProperty({ example: '0.00', description: 'VAT snapshot from CART (prices are VAT-inclusive).' })
  vat!: string;

  @ApiProperty({ example: '12241.20' })
  grand_total!: string;
}

export class OrderShipmentDto {
  @ApiPropertyOptional({ example: 'Pathao', nullable: true })
  courier_name?: string | null;

  @ApiPropertyOptional({ example: 'PA-99821', nullable: true })
  tracking_number?: string | null;
}

/** A single status-history entry on the customer detail view. */
export class OrderHistoryEntryDto {
  @ApiPropertyOptional({ enum: OrderStatus, nullable: true, example: OrderStatus.PENDING_PAYMENT })
  from_status?: OrderStatus | null;

  @ApiProperty({ enum: OrderStatus, example: OrderStatus.CONFIRMED })
  to_status!: OrderStatus;

  @ApiProperty({ example: 'system' })
  actor_type!: string;

  @ApiPropertyOptional({ example: 'Pathao PA-99821', nullable: true })
  note?: string | null;

  @ApiProperty({ example: '2026-06-03T10:05:11Z' })
  created_at!: string;
}

/** Full own-order detail for `GET /me/orders/{orderNo}` (FR-ORD-060, 071). */
export class OrderDetailDto {
  @ApiProperty({ example: 'SO-100245' })
  order_no!: string;

  @ApiProperty({ enum: OrderStatus, example: OrderStatus.SHIPPED })
  status!: OrderStatus;

  @ApiProperty({ example: '2026-06-03T10:00:00Z', description: 'Order placement date (RW6).' })
  placed_at!: string;

  @ApiProperty({ enum: OrderPaymentMethod, example: OrderPaymentMethod.BKASH })
  payment_method!: OrderPaymentMethod;

  @ApiProperty({ enum: OrderPaymentState, example: OrderPaymentState.PAID })
  payment_state!: OrderPaymentState;

  @ApiPropertyOptional({
    example: 'a1b2c3d4-…',
    nullable: true,
    description: "The order's payment id (PAY), for the admin payment panel; null if none.",
  })
  payment_id?: string | null;

  @ApiProperty({ enum: OrderDeliveryZone, example: OrderDeliveryZone.OUTSIDE_DHAKA })
  delivery_zone!: OrderDeliveryZone;

  @ApiProperty({ type: OrderAddressDto })
  address!: OrderAddressDto;

  @ApiProperty({ type: [OrderItemLineDto] })
  items!: OrderItemLineDto[];

  @ApiProperty({ type: OrderAmountsDto })
  amounts!: OrderAmountsDto;

  @ApiPropertyOptional({ example: 'EID500', nullable: true })
  applied_coupon_code?: string | null;

  @ApiProperty({ type: OrderShipmentDto })
  shipment!: OrderShipmentDto;

  @ApiProperty({ type: [OrderHistoryEntryDto] })
  history!: OrderHistoryEntryDto[];
}

/** A minimal history entry exposed to the unauthenticated guest tracking view (FR-ORD-061). */
export class GuestHistoryEntryDto {
  @ApiProperty({ enum: OrderStatus, example: OrderStatus.SHIPPED })
  to_status!: OrderStatus;

  @ApiProperty({ example: '2026-06-04T09:00:00Z' })
  created_at!: string;
}

/** Minimal tracking payload for `POST /orders/track` — status + shipment + history only (FR-ORD-061). */
export class GuestTrackResultDto {
  @ApiProperty({ example: 'SO-100245' })
  order_no!: string;

  @ApiProperty({ enum: OrderStatus, example: OrderStatus.SHIPPED })
  status!: OrderStatus;

  @ApiProperty({ example: '2026-06-03T10:00:00Z' })
  placed_at!: string;

  @ApiProperty({ type: OrderShipmentDto })
  shipment!: OrderShipmentDto;

  @ApiProperty({ type: [GuestHistoryEntryDto] })
  history!: GuestHistoryEntryDto[];
}
