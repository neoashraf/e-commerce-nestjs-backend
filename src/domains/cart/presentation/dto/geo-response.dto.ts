import { ApiProperty } from '@nestjs/swagger';

import { DeliveryZone } from '../../domain/enums/delivery-zone.enum';

/** `{ data: [ "Dhaka", ... ] }` — division/district name list (AC2). */
export class GeoNameListResponseDto {
  @ApiProperty({ type: [String], example: ['Barishal', 'Chattogram', 'Dhaka'] })
  data: string[];
}

/** A single area (upazila/thana) with its resolved delivery zone. */
export class GeoAreaDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'Dhaka' }) division: string;
  @ApiProperty({ example: 'Dhaka' }) district: string;
  @ApiProperty({ example: 'Dhanmondi' }) upazila: string;
  @ApiProperty({ enum: DeliveryZone, example: DeliveryZone.INSIDE_DHAKA })
  delivery_zone: DeliveryZone;
  @ApiProperty({ nullable: true, example: '1209' }) postal_code: string | null;
}

/** `{ data: [ GeoAreaDto, ... ] }` — areas within a district (AC2). */
export class GeoAreaListResponseDto {
  @ApiProperty({ type: [GeoAreaDto] }) data: GeoAreaDto[];
}

/** A single area incl. its active flag (admin override response). */
export class AdminGeoAreaDto extends GeoAreaDto {
  @ApiProperty({ example: true }) is_active: boolean;
}

/** `{ data: AdminGeoAreaDto }` — the area after an admin zone override (AC4). */
export class AdminGeoAreaResponseDto {
  @ApiProperty({ type: AdminGeoAreaDto }) data: AdminGeoAreaDto;
}
