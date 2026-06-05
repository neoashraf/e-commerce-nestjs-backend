import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { ServiceTokenGuard } from '../../../shared/guards/service-token.guard';
import {
  DecrementResult,
  ReleaseResult,
  ReservationService,
  ReserveResult,
  RestockResult,
} from '../application/reservation.service';
import { DecrementDto } from './dto/decrement.dto';
import { ReleaseDto } from './dto/release.dto';
import { ReserveDto } from './dto/reserve.dto';
import { RestockDto } from './dto/restock.dto';

/**
 * Internal inventory reservation + order coordination (SRS 11 §5.3/§5.4; contract: Reservations &
 * order coordination). Called service-to-service by CART (reserve/release) and ORD
 * (decrement/restock/scrap); guarded by the shared service token, not a customer/admin JWT. Every op
 * is transactional, idempotent per order, and writes through the stock ledger.
 */
@ApiTags('Inventory — Internal')
@ApiSecurity('service-token')
@UseGuards(ServiceTokenGuard)
@Controller('internal/inventory')
export class ReservationController {
  constructor(private readonly reservations: ReservationService) {}

  @Post('reserve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reserve stock for an order at placement (atomic; no partial hold)' })
  @ApiOkResponse({ description: '{ reserved: true, expires_at }' })
  @ApiConflictResponse({ description: 'INSUFFICIENT_STOCK with per-line shortfalls' })
  async reserve(@Body() dto: ReserveDto): Promise<ReserveResult> {
    return this.reservations.reserve(
      dto.order_id,
      dto.lines.map((l) => ({ variantId: l.variant_id, quantity: l.quantity })),
    );
  }

  @Post('release')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Release an order’s held reservations (idempotent)' })
  @ApiOkResponse({ description: '{ released: true }' })
  async release(@Body() dto: ReleaseDto): Promise<ReleaseResult> {
    return this.reservations.release(dto.order_id);
  }

  @Post('decrement')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Convert an order’s reservation to a sale on confirmation (idempotent)' })
  @ApiOkResponse({ description: '{ decremented: true } (replay adds already_applied: true)' })
  @ApiConflictResponse({ description: 'OVERSELL when on-hand is insufficient (flagged for admin)' })
  async decrement(@Body() dto: DecrementDto): Promise<DecrementResult> {
    return this.reservations.decrement(dto.order_id);
  }

  @Post('restock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restock (resellable) or scrap (defective) on cancel/exchange-return' })
  @ApiOkResponse({ description: '{ applied: true, disposition } (replay adds already_applied: true)' })
  async restock(@Body() dto: RestockDto): Promise<RestockResult> {
    return this.reservations.restock(
      dto.order_id,
      dto.disposition,
      dto.lines?.map((l) => ({ variantId: l.variant_id, quantity: l.quantity })),
    );
  }
}
