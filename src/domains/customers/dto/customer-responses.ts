import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Directory row (contract: GET /admin/customers data[]). */
export class CustomerListItemDto {
  @ApiProperty({ nullable: true, example: 'c_77…' }) customer_id!: string | null;
  @ApiProperty({ nullable: true, example: 'Sabbir Ahmed' }) full_name!: string | null;
  @ApiProperty({ nullable: true, example: '+8801712345678' }) phone!: string | null;
  @ApiProperty({ nullable: true, example: 'sabbir@example.com' }) email!: string | null;
  @ApiProperty({ example: 'active' }) status!: string;
  @ApiProperty({ type: [String], example: ['vip'] }) tags!: string[];
  @ApiProperty({ example: 7 }) order_count!: number;
  @ApiProperty({ example: '84230.00' }) total_spent!: string;
  @ApiProperty({ nullable: true, example: '2026-06-03T10:00:00Z' }) last_order_at!: string | null;
  @ApiProperty({ example: false }) is_guest!: boolean;
}

export class CustomerPreferencesDto {
  @ApiProperty({ example: false }) promo_sms_opt_in!: boolean;
  @ApiProperty({ example: true }) promo_email_opt_in!: boolean;
}

export class CustomerAddressDto {
  @ApiProperty({ example: 'addr_1' }) id!: string;
  @ApiProperty({ example: 'House 12, Road 5, Dhanmondi' }) address_line!: string;
  @ApiProperty({ example: 'Dhaka' }) district!: string;
  @ApiProperty({ example: true }) is_default!: boolean;
}

export class CustomerAggregatesDto {
  @ApiProperty({ example: 7 }) order_count!: number;
  @ApiProperty({ example: '84230.00' }) total_spent!: string;
  @ApiProperty({ example: '12032.86' }) avg_order_value!: string;
  @ApiProperty({ nullable: true, example: '2025-11-02T00:00:00Z' }) first_order_at!: string | null;
  @ApiProperty({ nullable: true, example: '2026-06-03T10:00:00Z' }) last_order_at!: string | null;
}

export class CustomerRecentOrderDto {
  @ApiProperty({ example: 'SO-100245' }) order_no!: string;
  @ApiProperty({ example: 'shipped' }) status!: string;
  @ApiProperty({ example: '12241.20' }) grand_total!: string;
  @ApiProperty({ example: '2026-06-03T10:00:00Z' }) placed_at!: string;
}

export class CustomerLeadDto {
  @ApiProperty({ example: 'HLP-20451' }) reference!: string;
  @ApiProperty({ example: 'claim_return' }) type!: string;
  @ApiProperty({ example: 'awaiting_customer' }) status!: string;
}

/** One wishlist item on the 360 (contract: GET /admin/customers/{id}/wishlist). */
export class AdminWishlistItemDto {
  @ApiProperty({ example: 'c7…' }) product_id!: string;
  @ApiProperty({ example: 'Adidas Predator Elite' }) product_title!: string;
  @ApiProperty({ nullable: true, example: 'https://…/listing.webp' }) product_image!: string | null;
  @ApiProperty({
    nullable: true,
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { color: 'Black', size: '42' },
  })
  variant_options!: Record<string, string> | null;
  @ApiProperty({ example: '12500.00', description: 'Effective price (BDT)' }) price!: string;
  @ApiProperty({ example: true }) in_stock!: boolean;
  @ApiProperty({ example: '2026-06-02T14:20:00Z' }) added_at!: string;
}

/** Customer 360 profile (contract: GET /admin/customers/{id}). */
export class CustomerProfileDto {
  @ApiProperty({ example: 'c_77…' }) customer_id!: string;
  @ApiProperty({ example: 'Sabbir Ahmed' }) full_name!: string;
  @ApiProperty({ example: '+8801712345678' }) phone!: string;
  @ApiProperty({ example: true }) phone_verified!: boolean;
  @ApiProperty({ nullable: true, example: 'sabbir@example.com' }) email!: string | null;
  @ApiProperty({ example: false }) email_verified!: boolean;
  @ApiProperty({ nullable: true, example: 'male' }) gender!: string | null;
  @ApiProperty({ nullable: true, example: '1995-03-12' }) date_of_birth!: string | null;
  @ApiProperty({ example: 'active' }) status!: string;
  @ApiProperty({ type: CustomerPreferencesDto }) preferences!: CustomerPreferencesDto;
  @ApiProperty({ type: [String], example: ['vip'] }) tags!: string[];
  @ApiProperty({ type: [CustomerAddressDto] }) addresses!: CustomerAddressDto[];
  @ApiProperty({ type: CustomerAggregatesDto }) aggregates!: CustomerAggregatesDto;
  @ApiProperty({ type: [CustomerRecentOrderDto] }) recent_orders!: CustomerRecentOrderDto[];
  @ApiProperty({ type: [CustomerLeadDto] }) leads!: CustomerLeadDto[];
  @ApiProperty({ example: 4 }) wishlist_count!: number;
}

export class SuspendResultDto {
  @ApiProperty({ example: 'c_77…' }) customer_id!: string;
  @ApiProperty({ example: 'suspended' }) status!: string;
  @ApiProperty({ example: true }) sessions_revoked!: boolean;
}

export class ReactivateResultDto {
  @ApiProperty({ example: 'active' }) status!: string;
}

export class NoteDto {
  @ApiProperty({ example: 'cn_3' }) id!: string;
  @ApiProperty({ example: 'Called about exchange; resolved.' }) body!: string;
  @ApiProperty({ example: 'a_12' }) admin_id!: string;
  @ApiProperty({ example: '2026-06-04T11:00:00Z' }) created_at!: string;
}

export class CreateNoteResultDto {
  @ApiProperty({ example: 'cn_3' }) id!: string;
  @ApiProperty({ example: '2026-06-04T11:00:00Z' }) created_at!: string;
}

export class TagDto {
  @ApiProperty({ example: 'tag_vip' }) id!: string;
  @ApiProperty({ example: 'wholesale' }) key!: string;
  @ApiProperty({ example: 'Wholesale' }) label!: string;
  @ApiProperty({ nullable: true, example: '#1A7F37' }) color!: string | null;
}

export class ExportJobDto {
  @ApiProperty({ example: 'exp_12' }) export_id!: string;
  @ApiProperty({ example: 'processing' }) status!: string;
}

export class ExportStatusDto {
  @ApiProperty({ example: 'ready' }) status!: string;
  @ApiPropertyOptional({ example: 'https://…/customers-export.csv' }) download_url?: string | null;
  @ApiPropertyOptional({ example: '2026-06-05T09:00:00Z' }) expires_at?: string | null;
}
