import {
  Body,
  Controller,
  Headers,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Request, Response } from 'express';

import { AuthenticatedCustomer } from '../../../../shared/decorators/current-customer.decorator';
import { CreateLightweightAccountUseCase } from '../../../auth/application/use-cases/create-lightweight-account.use-case';
import { CartActor } from '../../application/cart/cart.service';
import {
  CheckoutService,
  GuestInput,
  QuoteResult,
} from '../../application/checkout/checkout.service';
import { OptionalCustomerGuard } from '../guards/optional-customer.guard';
import { PlaceCheckoutDto, QuoteCheckoutDto } from '../dto/checkout.dto';

/**
 * Checkout orchestration endpoints (FR-CART-011–016, 032–038; contract: Checkout). Public shopper
 * surface (customer token or X-Cart-Token). `quote` returns the zone + summary + COD availability;
 * `place` requires an `Idempotency-Key`, re-validates lines/coupon, reserves stock, creates the order,
 * initiates payment, and clears the cart — idempotent per key (a replay returns `200`, a fresh place
 * `201`). Guests get a lightweight account (AUTH) before the order is created.
 */
@ApiTags('Checkout')
@ApiHeader({ name: 'X-Cart-Token', required: false, description: 'Guest cart token (opaque).' })
@UseGuards(OptionalCustomerGuard)
@Controller('checkout')
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly lightweightAccount: CreateLightweightAccountUseCase,
  ) {}

  @Post('quote')
  @ApiOperation({ summary: 'Quote a checkout: resolve zone, delivery charge, COD surcharge, VAT' })
  @ApiOkResponse({ description: '{ delivery_zone, summary, cod_available, payment_methods }' })
  @ApiBadRequestResponse({ description: 'UNSERVICEABLE_AREA / INVALID_ADDRESS' })
  @ApiConflictResponse({ description: 'COD_UNAVAILABLE' })
  quote(
    @Req() req: Request,
    @Headers('x-cart-token') cartToken: string | undefined,
    @Body() dto: QuoteCheckoutDto,
  ): Promise<QuoteResult> {
    return this.checkout.quote(this.actor(req, cartToken), dto.address, dto.payment_method);
  }

  @Post('place')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Client-generated idempotency key.' })
  @ApiOperation({ summary: 'Place the order: reserve stock, create order, initiate payment (idempotent)' })
  @ApiCreatedResponse({ description: 'Order + payment (201 fresh, 200 idempotent replay)' })
  @ApiConflictResponse({ description: 'CART_CHANGED / COUPON_INVALID / CART_EMPTY' })
  @ApiUnprocessableEntityResponse({ description: 'TOTAL_MISMATCH' })
  async place(
    @Req() req: Request,
    @Headers('x-cart-token') cartToken: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: PlaceCheckoutDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.checkout.place(this.actor(req, cartToken), idempotencyKey ?? '', {
      address: dto.address,
      payment_method: dto.payment_method,
      guest: dto.guest ?? null,
      expected_total: dto.expected_total,
      acknowledge_changes: dto.acknowledge_changes,
      resolveGuestCustomerId: (guest: GuestInput) => this.resolveGuest(guest),
    });
    // Idempotent replay → 200; a fresh placement → 201 (contract).
    res.status(result.replay ? HttpStatus.OK : HttpStatus.CREATED);
    return { order: result.order, payment: result.payment };
  }

  // --- helpers ---

  private actor(req: Request, cartToken: string | undefined): CartActor {
    const user = req.user as AuthenticatedCustomer | undefined;
    return { customerId: user?.customerId ?? null, cartToken: cartToken ?? null };
  }

  private async resolveGuest(guest: GuestInput): Promise<string> {
    const result = await this.lightweightAccount.execute({
      fullName: guest.full_name,
      phone: guest.phone,
      email: guest.email ?? null,
    });
    return result.customerId;
  }
}
