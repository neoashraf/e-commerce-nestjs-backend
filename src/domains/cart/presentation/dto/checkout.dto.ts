import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { DeliveryZone } from '../../domain/enums/delivery-zone.enum';

const PAYMENT_METHODS = ['cod', 'bkash', 'sslcommerz'] as const;

export class CheckoutAddressDto {
  @ApiPropertyOptional({ example: 'addr_1', description: 'Saved address id (else provide a full address).' })
  @IsOptional()
  @IsString()
  address_id?: string;

  @ApiPropertyOptional({ example: 'Sabbir Ahmed' })
  @IsOptional()
  @IsString()
  recipient_name?: string;

  @ApiPropertyOptional({ example: '+8801712345678' })
  @IsOptional()
  @IsString()
  recipient_phone?: string;

  @ApiPropertyOptional({ example: 'House 12, Road 5, Dhanmondi' })
  @IsOptional()
  @IsString()
  address_line?: string;

  @ApiPropertyOptional({ example: 'Dhanmondi', description: 'Area / upazila (used for zone resolution).' })
  @IsOptional()
  @IsString()
  area?: string;

  @ApiPropertyOptional({ example: 'Dhaka' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ example: 'Dhaka' })
  @IsOptional()
  @IsString()
  division?: string;

  @ApiPropertyOptional({ example: '1209' })
  @IsOptional()
  @IsString()
  postal_code?: string;
}

export class GuestDto {
  @ApiProperty({ example: 'Sabbir Ahmed' })
  @IsString()
  @IsNotEmpty()
  full_name: string;

  @ApiProperty({ example: '+8801712345678' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ example: 'sabbir@example.com' })
  @IsOptional()
  @IsString()
  email?: string | null;
}

export class QuoteCheckoutDto {
  @ApiProperty({ type: CheckoutAddressDto })
  @ValidateNested()
  @Type(() => CheckoutAddressDto)
  address: CheckoutAddressDto;

  @ApiProperty({ example: 'cod', enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS as unknown as string[])
  payment_method: string;
}

export class PlaceCheckoutDto {
  @ApiProperty({ type: CheckoutAddressDto })
  @ValidateNested()
  @Type(() => CheckoutAddressDto)
  address: CheckoutAddressDto;

  @ApiProperty({ example: 'bkash', enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS as unknown as string[])
  payment_method: string;

  @ApiPropertyOptional({ type: GuestDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => GuestDto)
  guest?: GuestDto | null;

  @ApiPropertyOptional({ example: '12241.20', description: 'Guards against silent summary changes.' })
  @IsOptional()
  @IsNumberString()
  expected_total?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  acknowledge_changes?: boolean;
}

// --- admin delivery settings ---

export class DeliveryZoneChargeDto {
  @ApiProperty({ enum: DeliveryZone, example: DeliveryZone.OUTSIDE_DHAKA })
  @IsEnum(DeliveryZone)
  zone: DeliveryZone;

  @ApiProperty({ example: '120.00' })
  @IsNumberString()
  delivery_charge: string;

  @ApiProperty({ example: '1.00' })
  @IsNumberString()
  cod_surcharge_pct: string;

  @ApiProperty({ example: '0.00' })
  @IsNumberString()
  cod_surcharge_flat: string;

  @ApiPropertyOptional({ example: '5000.00', nullable: true })
  @IsOptional()
  @IsNumberString()
  free_shipping_threshold?: string | null;

  @ApiProperty({ example: true })
  @IsBoolean()
  cod_enabled: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  is_active: boolean;
}

export class UpdateDeliverySettingsDto {
  @ApiProperty({ type: DeliveryZoneChargeDto, isArray: true })
  @ValidateNested({ each: true })
  @Type(() => DeliveryZoneChargeDto)
  zones: DeliveryZoneChargeDto[];
}
