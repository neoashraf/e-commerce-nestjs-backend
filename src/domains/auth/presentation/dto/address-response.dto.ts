import { ApiProperty } from '@nestjs/swagger';

export class AddressResponseDto {
  @ApiProperty({ example: 'addr_1' })
  id: string;

  @ApiProperty({ example: 'Sabbir Ahmed' })
  recipient_name: string;

  @ApiProperty({ example: '+8801712345678' })
  recipient_phone: string;

  @ApiProperty({ example: 'House 12, Road 5, Dhanmondi' })
  address_line: string;

  @ApiProperty({ example: 'Dhanmondi' })
  area: string;

  @ApiProperty({ example: 'Dhaka' })
  district: string;

  @ApiProperty({ example: 'Dhaka' })
  division: string;

  @ApiProperty({ example: '1209', nullable: true })
  postal_code: string | null;

  @ApiProperty({ example: 'inside_dhaka', enum: ['inside_dhaka', 'near_dhaka', 'outside_dhaka'] })
  delivery_zone: string;

  @ApiProperty({ example: true })
  is_default: boolean;
}

export class CreateAddressResponseDto {
  @ApiProperty({ example: 'addr_1' })
  id: string;

  @ApiProperty({ example: true })
  is_default: boolean;
}
