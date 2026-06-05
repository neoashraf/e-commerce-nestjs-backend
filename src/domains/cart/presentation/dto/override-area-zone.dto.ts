import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import { DeliveryZone } from '../../domain/enums/delivery-zone.enum';

/** Body for `PATCH /admin/geo/areas/{id}` — the new delivery zone for the area (FR-CART-047). */
export class OverrideAreaZoneDto {
  @ApiProperty({ enum: DeliveryZone, example: DeliveryZone.NEAR_DHAKA })
  @IsEnum(DeliveryZone)
  delivery_zone: DeliveryZone;
}
