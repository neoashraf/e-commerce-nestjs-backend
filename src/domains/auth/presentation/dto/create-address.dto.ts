import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

const DELIVERY_ZONES = ['inside_dhaka', 'near_dhaka', 'outside_dhaka'];

export class CreateAddressDto {
  @ApiProperty({ example: 'Sabbir Ahmed', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @Length(2, 120)
  recipient_name: string;

  @ApiProperty({ example: '+8801712345678', description: 'BD mobile, normalized to E.164' })
  @IsString()
  @IsNotEmpty()
  recipient_phone: string;

  @ApiProperty({ example: 'House 12, Road 5, Dhanmondi', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  address_line: string;

  @ApiProperty({ example: 'Dhanmondi', description: 'Area / thana / upazila', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  area: string;

  @ApiProperty({ example: 'Dhaka', maxLength: 80 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  district: string;

  @ApiProperty({ example: 'Dhaka', maxLength: 80 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  division: string;

  @ApiPropertyOptional({ example: '1209', description: '4-digit BD postal code' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, { message: 'postal_code must be 4 digits' })
  postal_code?: string;

  @ApiPropertyOptional({
    enum: DELIVERY_ZONES,
    description:
      'Accepted for contract compatibility but ignored — the server resolves the zone from district/area (FR-AUTH-051).',
  })
  @IsOptional()
  @IsIn(DELIVERY_ZONES)
  delivery_zone?: string;

  @ApiPropertyOptional({ example: true, description: 'Mark this address as the default' })
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}
