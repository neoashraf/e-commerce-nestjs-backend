import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { OrderDeliveryZone, OrderPaymentMethod } from '../../../orders/domain/order-enums';
import { OrderAddressSnapshot } from '../../../orders/infrastructure/persistence/typeorm/entities/order.orm-entity';
import { PaymentMethod } from '../../../payments/domain/payment-enums';
import { CartLine } from '../../../promotions/application/eligibility';
import { DeliveryZone } from '../../domain/enums/delivery-zone.enum';
import {
  GEO_AREA_REPOSITORY,
  IGeoAreaRepository,
} from '../../domain/repositories/geo-area.repository.interface';
import { CheckoutSessionOrmEntity } from '../../infrastructure/persistence/typeorm/entities/checkout-session.orm-entity';
import { CartActor, CartService, CartView } from '../cart/cart.service';
import { ZoneResolverService } from '../services/zone-resolver.service';
import { DeliverySettingsService } from './delivery-settings.service';
import { SummaryService } from './summary.service';
import {
  COUPON_VALIDATOR,
  ICouponValidator,
  IOrderPlacer,
  IPaymentInitiator,
  IStockReserver,
  ORDER_PLACER,
  PAYMENT_INITIATOR,
  STOCK_RESERVER,
} from './checkout.ports';

/** A delivery address as supplied to quote/place — a saved address id or a full address object. */
export interface CheckoutAddressInput {
  address_id?: string;
  recipient_name?: string;
  recipient_phone?: string;
  address_line?: string;
  area?: string;
  district?: string;
  division?: string;
  postal_code?: string;
}

export interface GuestInput {
  full_name: string;
  phone: string;
  email?: string | null;
}

export interface QuoteResult {
  delivery_zone: DeliveryZone;
  summary: ReturnType<SummaryService['computeSummary']>;
  cod_available: boolean;
  payment_methods: string[];
}

export interface PlaceResult {
  order: { id: string; order_no: string; status: string; grand_total: string };
  payment: { method: string; action: 'redirect' | 'none'; status?: string; redirect_url?: string };
  replay?: boolean;
}

const METHOD_MAP: Record<string, OrderPaymentMethod> = {
  cod: OrderPaymentMethod.COD,
  bkash: OrderPaymentMethod.BKASH,
  sslcommerz: OrderPaymentMethod.SSLCOMMERZ,
};

const PAY_METHOD_MAP: Record<string, PaymentMethod> = {
  cod: PaymentMethod.COD,
  bkash: PaymentMethod.BKASH,
  sslcommerz: PaymentMethod.SSLCOMMERZ,
};

const ZONE_MAP: Record<DeliveryZone, OrderDeliveryZone> = {
  [DeliveryZone.INSIDE_DHAKA]: OrderDeliveryZone.INSIDE_DHAKA,
  [DeliveryZone.NEAR_DHAKA]: OrderDeliveryZone.NEAR_DHAKA,
  [DeliveryZone.OUTSIDE_DHAKA]: OrderDeliveryZone.OUTSIDE_DHAKA,
};

/**
 * Checkout orchestration (FR-CART-010–016, 030–038) — turns an active cart into a placed order. **Quote**
 * resolves the zone from the address, computes the full summary (subtotal − discount + delivery + COD
 * surcharge + informational VAT), and reports COD availability. **Place** re-validates lines + coupon,
 * reserves stock (INV), creates the order (ORD) with a full snapshot, initiates payment (PAY), clears the
 * cart, and is **idempotent** per `Idempotency-Key`. Every cross-module call goes through a port wired to
 * the real impl (INV/ORD/PAY/PROMO). On any downstream failure the reservation is released and the cart
 * retained. Coupon is redeemed (PROMO) after the order is created.
 */
@Injectable()
export class CheckoutService {
  constructor(
    @InjectRepository(CheckoutSessionOrmEntity)
    private readonly sessions: Repository<CheckoutSessionOrmEntity>,
    @Inject(GEO_AREA_REPOSITORY) private readonly geo: IGeoAreaRepository,
    private readonly carts: CartService,
    private readonly zoneResolver: ZoneResolverService,
    private readonly deliverySettings: DeliverySettingsService,
    private readonly summary: SummaryService,
    @Inject(STOCK_RESERVER) private readonly stock: IStockReserver,
    @Inject(ORDER_PLACER) private readonly orders: IOrderPlacer,
    @Inject(PAYMENT_INITIATOR) private readonly payments: IPaymentInitiator,
    @Inject(COUPON_VALIDATOR) private readonly coupons: ICouponValidator,
  ) {}

  // ---------------------------------------------------------------------------
  // Quote (FR-CART-011–016)
  // ---------------------------------------------------------------------------

  async quote(
    actor: CartActor,
    address: CheckoutAddressInput,
    paymentMethod: string,
  ): Promise<QuoteResult> {
    const zone = await this.resolveZone(address);
    const charge = await this.deliverySettings.chargeFor(zone);
    const cart = await this.carts.getCart(actor);

    const method = METHOD_MAP[paymentMethod];
    if (!method) {
      throw new BadRequestException({ code: 'INVALID_METHOD', message: 'Unknown payment method.' });
    }

    // COD availability for the zone (FR-CART-016).
    const codAvailable = charge.cod_enabled;
    if (method === OrderPaymentMethod.COD && !codAvailable) {
      throw new ConflictException({ code: 'COD_UNAVAILABLE', message: 'COD is not available in this zone.' });
    }

    const summary = this.summary.computeSummary(
      cart.summary.subtotal,
      cart.summary.discount,
      charge,
      method,
    );

    const paymentMethods = ['bkash', 'sslcommerz'];
    if (codAvailable) paymentMethods.unshift('cod');

    return { delivery_zone: zone, summary, cod_available: codAvailable, payment_methods: paymentMethods };
  }

  // ---------------------------------------------------------------------------
  // Place (FR-CART-032–038)
  // ---------------------------------------------------------------------------

  async place(
    actor: CartActor,
    idempotencyKey: string,
    input: {
      address: CheckoutAddressInput;
      payment_method: string;
      guest?: GuestInput | null;
      expected_total?: string;
      acknowledge_changes?: boolean;
      customer_note?: string | null;
    },
  ): Promise<PlaceResult> {
    if (!idempotencyKey) {
      throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Idempotency-Key is required.' });
    }

    // Idempotent replay: a session for this key returns the same order, untouched (FR-CART-036).
    const prior = await this.sessions.findOne({ where: { idempotencyKey } });
    if (prior?.placedOrderId) {
      return this.replayResult(prior, input.payment_method);
    }

    const method = METHOD_MAP[input.payment_method];
    if (!method) {
      throw new BadRequestException({ code: 'INVALID_METHOD', message: 'Unknown payment method.' });
    }

    const cart = await this.carts.getActiveCart(actor);
    const view = await this.carts.getCart(actor);
    if (!cart || view.items.length === 0) {
      throw new ConflictException({ code: 'CART_EMPTY', message: 'Cart is empty.' });
    }

    // Re-validate lines: anything not in_stock or unavailable blocks placement unless acknowledged.
    const outOfStock = view.items.filter((i) => i.availability === 'out_of_stock').map((i) => i.item_id);
    if (outOfStock.length > 0 && !input.acknowledge_changes) {
      throw new ConflictException({
        code: 'CART_CHANGED',
        details: { repriced: [], out_of_stock: outOfStock },
      });
    }

    const zone = await this.resolveZone(input.address);
    const charge = await this.deliverySettings.chargeFor(zone);

    // Re-validate the coupon at placement (FR-CART-022/032).
    let discount = '0.00';
    let appliedCoupon: string | null = cart.appliedCouponCode ?? null;
    if (appliedCoupon) {
      const lines: CartLine[] = view.items.map((i) => ({
        product_id: i.product_id,
        category_id: null,
        quantity: i.quantity,
        effective_unit_price: i.unit_price,
      }));
      const verdict = await this.coupons.validate({
        code: appliedCoupon,
        identity: this.identity(actor, input.guest),
        lines,
        subtotal: view.summary.subtotal,
      });
      if (!verdict.valid) {
        throw new ConflictException({ code: 'COUPON_INVALID', reason: verdict.reason });
      }
      discount = verdict.discount_amount;
    }

    const summary = this.summary.computeSummary(view.summary.subtotal, discount, charge, method);

    // expected_total guard (FR-CART-032) → 422 on mismatch.
    if (input.expected_total && Number(input.expected_total) !== Number(summary.grand_total)) {
      throw new UnprocessableEntityException({
        code: 'TOTAL_MISMATCH',
        message: 'The order total has changed; please review and retry.',
        details: { expected_total: input.expected_total, actual_total: summary.grand_total },
      });
    }

    // Buyer: a signed-in customer, else null — guests place the order WITHOUT an account. The guest
    // snapshot (name/phone/email) is retained on the order; AUTH links it to an account later when
    // the same phone is verified via OTP (guest-order claim).
    const customerId = actor.customerId ?? null;

    const addressSnapshot = await this.buildAddressSnapshot(input.address, input.guest);

    // Create the order (ORD) with the full immutable snapshot.
    const placed = await this.orders.place({
      customer_id: customerId,
      guest_name: input.guest?.full_name ?? null,
      guest_phone: input.guest?.phone ?? null,
      guest_email: input.guest?.email ?? null,
      payment_method: method,
      delivery_zone: ZONE_MAP[zone],
      address: addressSnapshot,
      items: view.items.map((i) => ({
        product_id: i.product_id,
        variant_id: i.variant_id,
        product_title: i.title,
        sku_code: i.sku_code,
        variant_options: i.options,
        unit_price: i.unit_price,
        quantity: i.quantity,
        line_total: i.line_total,
      })),
      amounts: {
        subtotal: summary.subtotal,
        discount_amount: summary.discount,
        delivery_charge: summary.delivery_charge,
        cod_surcharge: summary.cod_surcharge,
        vat_amount: summary.vat,
        grand_total: summary.grand_total,
      },
      applied_coupon_code: appliedCoupon,
      idempotency_key: idempotencyKey,
      customer_note: input.customer_note ?? null,
    });

    // Reserve stock (INV) + initiate payment (PAY); on any failure release + retain the cart.
    try {
      await this.stock.reserve(
        placed.orderId,
        view.items.map((i) => ({ variantId: i.variant_id, quantity: i.quantity })),
      );

      if (appliedCoupon) {
        await this.coupons.redeem({
          code: appliedCoupon,
          orderId: placed.orderId,
          identity: this.identity(actor, input.guest),
          discountAmount: summary.discount,
        });
      }

      const payment = await this.payments.initiate({
        orderId: placed.orderId,
        method: PAY_METHOD_MAP[input.payment_method],
      });

      // Clear the cart only after the order is created + payment initiated (FR-CART-037).
      await this.carts.markConverted(cart.id);

      // Persist the session for idempotent replay.
      await this.sessions.save(
        this.sessions.create({
          cartId: cart.id,
          idempotencyKey,
          placedOrderId: placed.orderId,
          placedOrderNo: placed.orderNo,
          orderStatus: placed.status,
          paymentAction: payment.action,
          paymentRedirectUrl: payment.redirectUrl ?? null,
          paymentStatus: payment.status,
          grandTotal: summary.grand_total,
        }),
      );

      return {
        order: {
          id: placed.orderId,
          order_no: placed.orderNo,
          status: placed.status,
          grand_total: summary.grand_total,
        },
        payment: {
          method: input.payment_method,
          action: payment.action,
          status: payment.status,
          redirect_url: payment.redirectUrl,
        },
      };
    } catch (err) {
      // Downstream failure: release the reservation, keep the cart (FR-CART-033).
      await this.stock.release(placed.orderId).catch(() => undefined);
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async resolveZone(address: CheckoutAddressInput): Promise<DeliveryZone> {
    let district = address.district;
    let upazila = address.area;

    if (address.address_id) {
      // Saved-address resolution is owned by AUTH; until that read seam is wired, require a full
      // address for zone resolution. (Integration: read the saved address via the AUTH port.)
      throw new BadRequestException({
        code: 'ADDRESS_RESOLUTION_UNAVAILABLE',
        message: 'Provide a full address; saved-address lookup is wired at AUTH integration.',
      });
    }
    if (!district || !upazila) {
      throw new BadRequestException({ code: 'INVALID_ADDRESS', message: 'district and area are required.' });
    }

    const resolution = await this.zoneResolver.resolveZone(district, upazila);
    if (!resolution.serviceable) {
      throw new BadRequestException({
        code: 'UNSERVICEABLE_AREA',
        message: 'We do not deliver to this area yet.',
      });
    }
    return resolution.zone as DeliveryZone;
  }

  private async buildAddressSnapshot(
    address: CheckoutAddressInput,
    guest?: GuestInput | null,
  ): Promise<OrderAddressSnapshot> {
    return {
      recipient_name: address.recipient_name ?? guest?.full_name ?? '',
      recipient_phone: address.recipient_phone ?? guest?.phone ?? '',
      address_line: address.address_line ?? '',
      area: address.area ?? null,
      district: address.district ?? null,
      division: address.division ?? null,
      postal_code: address.postal_code ?? null,
    };
  }

  private identity(actor: CartActor, guest?: GuestInput | null) {
    return {
      customer_id: actor.customerId ?? null,
      guest_phone: actor.customerId ? null : guest?.phone ?? null,
    };
  }

  private replayResult(session: CheckoutSessionOrmEntity, method: string): PlaceResult {
    return {
      replay: true,
      order: {
        id: session.placedOrderId as string,
        order_no: session.placedOrderNo as string,
        status: session.orderStatus as string,
        grand_total: session.grandTotal as string,
      },
      payment: {
        method,
        action: (session.paymentAction as 'redirect' | 'none') ?? 'none',
        status: session.paymentStatus ?? undefined,
        redirect_url: session.paymentRedirectUrl ?? undefined,
      },
    };
  }
}
