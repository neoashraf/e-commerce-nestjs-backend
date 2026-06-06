import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { OrderTrackingService } from '../../application/services/order-tracking.service';
import { GuestTrackDto, GuestTrackResultDto } from '../dto/tracking.dto';

/**
 * Public guest order tracking (FR-ORD-061, 062; contract: Guest — Tracking). Matches `order_no` + `phone`
 * and returns only status + shipment + history. A mismatch (wrong phone / unknown order) is a generic
 * `404` to prevent enumeration (§12.13), and lookups are rate-limited (`429`) to deter guessing (FR-ORD-062).
 */
@ApiTags('Orders — Guest Tracking')
@Controller('orders')
export class GuestTrackingController {
  constructor(private readonly tracking: OrderTrackingService) {}

  @Post('track')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Track an order by order number + phone (public, rate-limited)' })
  @ApiOkResponse({ type: GuestTrackResultDto })
  @ApiNotFoundResponse({ description: 'No matching order (generic — order_no + phone did not match)' })
  @ApiTooManyRequestsResponse({ description: 'Too many tracking attempts' })
  track(@Body() dto: GuestTrackDto): Promise<GuestTrackResultDto> {
    return this.tracking.trackGuest(dto.order_no, dto.phone);
  }
}
