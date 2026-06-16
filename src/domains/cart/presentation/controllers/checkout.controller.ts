import {
  BadRequestException,
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
import { BdPhone } from '../../../auth/domain/value-objects/bd-phone.vo';
import { GetAddressUseCase } from '../../../auth/application/use-cases/get-address.use-case';
import { CartActor } from '../../application/cart/cart.service';
import {
  CheckoutAddressInput,
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
 * `201`). Guests place orders **without** an account (customer_id null, guest snapshot retained); the
 * orders are linked to an account later when the same phone is verified via OTP (AUTH guest-order claim).
 */
@ApiTags('Checkout')
@ApiHeader({ name: 'X-Cart-Token', required: false, description: 'Guest cart token (opaque).' })
@UseGuards(OptionalCustomerGuard)
@Controller('checkout')
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly getAddress: GetAddressUseCase,
  ) {}

  @Post('quote')
  @ApiOperation({ summary: 'Quote a checkout: resolve zone, delivery charge, COD surcharge, VAT' })
  @ApiOkResponse({ description: '{ delivery_zone, summary, cod_available, payment_methods }' })
  @ApiBadRequestResponse({ description: 'UNSERVICEABLE_AREA / INVALID_ADDRESS' })
  @ApiConflictResponse({ description: 'COD_UNAVAILABLE' })
  async quote(
    @Req() req: Request,
    @Headers('x-cart-token') cartToken: string | undefined,
    @Body() dto: QuoteCheckoutDto,
  ): Promise<QuoteResult> {
    const actor = this.actor(req, cartToken);
    const address = await this.resolveAddress(actor, dto.address);
    return this.checkout.quote(actor, address, dto.payment_method);
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
    const actor = this.actor(req, cartToken);
    const address = await this.resolveAddress(actor, dto.address);
    const result = await this.checkout.place(actor, idempotencyKey ?? '', {
      address,
      payment_method: dto.payment_method,
      guest: this.normalizeGuest(actor, dto.guest),
      expected_total: dto.expected_total,
      acknowledge_changes: dto.acknowledge_changes,
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

  /**
   * Expand a saved `address_id` into a full address (AUTH seam, FR-AUTH-050). Saved addresses belong
   * to a signed-in customer; guests must supply a full address. A full address passes through as-is.
   */
  private async resolveAddress(
    actor: CartActor,
    address: CheckoutAddressInput,
  ): Promise<CheckoutAddressInput> {
    if (!address?.address_id) return address;
    if (!actor.customerId) {
      throw new BadRequestException({
        code: 'ADDRESS_RESOLUTION_UNAVAILABLE',
        message: 'Sign in to use a saved address, or provide a full address.',
      });
    }
    const saved = await this.getAddress.execute({
      customerId: actor.customerId,
      addressId: address.address_id,
    });
    return {
      recipient_name: saved.recipientName,
      recipient_phone: saved.recipientPhone,
      address_line: saved.addressLine,
      area: saved.area,
      district: saved.district,
      division: saved.division,
      postal_code: saved.postalCode ?? undefined,
    };
  }

  /**
   * Normalize the guest block for a guest checkout: phone → E.164 so the order's `guest_phone`
   * matches the OTP-verified phone later (enables guest-order claim on sign-in). Signed-in customers
   * ignore the guest block. No account is created here — the order is placed as a pure guest order.
   */
  private normalizeGuest(actor: CartActor, guest: GuestInput | null | undefined): GuestInput | null {
    if (actor.customerId || !guest) return null;
    const phone = BdPhone.toE164(guest.phone);
    if (!phone) {
      throw new BadRequestException({
        code: 'INVALID_PHONE',
        message: 'A valid Bangladesh mobile number is required.',
      });
    }
    return { full_name: guest.full_name, phone, email: guest.email ?? null };
  }
}
