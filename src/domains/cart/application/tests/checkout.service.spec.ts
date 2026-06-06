import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { CheckoutService } from '../checkout/checkout.service';
import { CartView } from '../cart/cart.service';
import { DeliverySettingsService, ZoneCharge } from '../checkout/delivery-settings.service';
import { SummaryService } from '../checkout/summary.service';
import {
  COUPON_VALIDATOR,
  ORDER_PLACER,
  PAYMENT_INITIATOR,
  STOCK_RESERVER,
} from '../checkout/checkout.ports';
import { CartService } from '../cart/cart.service';
import { ZoneResolverService } from '../services/zone-resolver.service';
import { GEO_AREA_REPOSITORY } from '../../domain/repositories/geo-area.repository.interface';
import { DeliveryZone } from '../../domain/enums/delivery-zone.enum';
import { CheckoutSessionOrmEntity } from '../../infrastructure/persistence/typeorm/entities/checkout-session.orm-entity';

const ADDRESS = { district: 'Dhaka', area: 'Dhanmondi', address_line: 'House 12' };
const ACTOR = { customerId: 'c1', cartToken: null };

const cartView = (subtotal = '5000.00'): CartView => ({
  cart_id: 'cart_1',
  cart_token: null,
  currency: 'BDT' as const,
  items: [
    {
      item_id: 'ci_1',
      product_id: 'p1',
      variant_id: 'v1',
      sku_code: 'SKU-1',
      title: 'Boot',
      options: {},
      image: null,
      unit_price: subtotal,
      quantity: 1,
      line_total: subtotal,
      availability: 'in_stock' as const,
    },
  ],
  applied_coupon: null,
  summary: {
    subtotal,
    discount: '0.00',
    delivery_charge: '0.00',
    cod_surcharge: '0.00',
    vat: '0.00',
    grand_total: subtotal,
    delivery_zone: null,
  },
});

const zoneCharge: ZoneCharge = {
  zone: DeliveryZone.OUTSIDE_DHAKA,
  delivery_charge: '120.00',
  cod_surcharge_pct: '1.00',
  cod_surcharge_flat: '0.00',
  free_shipping_threshold: null,
  cod_enabled: true,
  is_active: true,
};

describe('Cart — CheckoutService', () => {
  let service: CheckoutService;
  let sessions: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let carts: { getCart: jest.Mock; getActiveCart: jest.Mock; markConverted: jest.Mock };
  let zoneResolver: { resolveZone: jest.Mock };
  let deliverySettings: { chargeFor: jest.Mock };
  let stock: { reserve: jest.Mock; release: jest.Mock };
  let orders: { place: jest.Mock };
  let payments: { initiate: jest.Mock };
  let coupons: { validate: jest.Mock; redeem: jest.Mock };

  beforeEach(async () => {
    sessions = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((s) => s),
      save: jest.fn().mockImplementation((s) => Promise.resolve(s)),
    };
    carts = {
      getCart: jest.fn().mockResolvedValue(cartView()),
      getActiveCart: jest.fn().mockResolvedValue({ id: 'cart_1', appliedCouponCode: null }),
      markConverted: jest.fn().mockResolvedValue(undefined),
    };
    zoneResolver = {
      resolveZone: jest.fn().mockResolvedValue({ serviceable: true, zone: DeliveryZone.OUTSIDE_DHAKA }),
    };
    deliverySettings = { chargeFor: jest.fn().mockResolvedValue(zoneCharge) };
    stock = { reserve: jest.fn().mockResolvedValue(undefined), release: jest.fn().mockResolvedValue(undefined) };
    orders = {
      place: jest.fn().mockResolvedValue({ orderId: 'ord_1', orderNo: 'SO-100000', status: 'pending_payment' }),
    };
    payments = {
      initiate: jest.fn().mockResolvedValue({ action: 'redirect', status: 'initiated', redirectUrl: 'https://bkash' }),
    };
    coupons = { validate: jest.fn(), redeem: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutService,
        SummaryService,
        { provide: getRepositoryToken(CheckoutSessionOrmEntity), useValue: sessions },
        { provide: GEO_AREA_REPOSITORY, useValue: {} },
        { provide: CartService, useValue: carts },
        { provide: ZoneResolverService, useValue: zoneResolver },
        { provide: DeliverySettingsService, useValue: deliverySettings },
        { provide: STOCK_RESERVER, useValue: stock },
        { provide: ORDER_PLACER, useValue: orders },
        { provide: PAYMENT_INITIATOR, useValue: payments },
        { provide: COUPON_VALIDATOR, useValue: coupons },
      ],
    }).compile();

    service = module.get(CheckoutService);
  });

  afterEach(() => jest.clearAllMocks());

  // --- quote ---

  it('should quote the zone + summary with COD surcharge for COD', async () => {
    const result = await service.quote(ACTOR, ADDRESS, 'cod');
    expect(result.delivery_zone).toBe(DeliveryZone.OUTSIDE_DHAKA);
    expect(result.summary.delivery_charge).toBe('120.00');
    expect(result.summary.cod_surcharge).toBe('50.00');
    expect(result.cod_available).toBe(true);
  });

  it('should reject COD in a COD-disabled zone (409)', async () => {
    deliverySettings.chargeFor.mockResolvedValue({ ...zoneCharge, cod_enabled: false });
    await expect(service.quote(ACTOR, ADDRESS, 'cod')).rejects.toBeInstanceOf(ConflictException);
  });

  // --- place ---

  it('should place an online order pending_payment with a redirect', async () => {
    const result = await service.place(ACTOR, 'key-1', {
      address: ADDRESS,
      payment_method: 'bkash',
    });
    expect(stock.reserve).toHaveBeenCalledWith('ord_1', [{ variantId: 'v1', quantity: 1 }]);
    expect(result.order.status).toBe('pending_payment');
    expect(result.payment.action).toBe('redirect');
    expect(carts.markConverted).toHaveBeenCalledWith('cart_1');
  });

  it('should place a COD order confirmed with action none', async () => {
    orders.place.mockResolvedValue({ orderId: 'ord_2', orderNo: 'SO-100001', status: 'confirmed' });
    payments.initiate.mockResolvedValue({ action: 'none', status: 'cod_pending' });
    const result = await service.place(ACTOR, 'key-2', { address: ADDRESS, payment_method: 'cod' });
    expect(result.order.status).toBe('confirmed');
    expect(result.payment.action).toBe('none');
  });

  it('should be idempotent: a replay with a known key returns the same order untouched', async () => {
    sessions.findOne.mockResolvedValue({
      placedOrderId: 'ord_1',
      placedOrderNo: 'SO-100000',
      orderStatus: 'pending_payment',
      paymentAction: 'redirect',
      paymentRedirectUrl: 'https://bkash',
      paymentStatus: 'initiated',
      grandTotal: '5120.00',
    });
    const result = await service.place(ACTOR, 'key-1', { address: ADDRESS, payment_method: 'bkash' });
    expect(result.replay).toBe(true);
    expect(result.order.order_no).toBe('SO-100000');
    expect(orders.place).not.toHaveBeenCalled();
    expect(stock.reserve).not.toHaveBeenCalled();
  });

  it('should block placement with CART_CHANGED when a line is out of stock and not acknowledged', async () => {
    const v = cartView();
    v.items[0] = { ...v.items[0], availability: 'out_of_stock' as const };
    carts.getCart.mockResolvedValue(v);
    await expect(
      service.place(ACTOR, 'key-3', { address: ADDRESS, payment_method: 'bkash' }),
    ).rejects.toMatchObject({ response: { code: 'CART_CHANGED' } });
  });

  it('should reject placement with 422 when expected_total mismatches', async () => {
    await expect(
      service.place(ACTOR, 'key-4', {
        address: ADDRESS,
        payment_method: 'bkash',
        expected_total: '999.00',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('should reject placement with COUPON_INVALID when the applied coupon fails re-validation', async () => {
    carts.getActiveCart.mockResolvedValue({ id: 'cart_1', appliedCouponCode: 'EXPIRED' });
    coupons.validate.mockResolvedValue({ valid: false, reason: 'expired', message: 'expired' });
    await expect(
      service.place(ACTOR, 'key-5', { address: ADDRESS, payment_method: 'bkash' }),
    ).rejects.toMatchObject({ response: { code: 'COUPON_INVALID' } });
  });

  it('should release the reservation and retain the cart when payment initiation fails', async () => {
    payments.initiate.mockRejectedValue(new Error('gateway down'));
    await expect(
      service.place(ACTOR, 'key-6', { address: ADDRESS, payment_method: 'bkash' }),
    ).rejects.toThrow('gateway down');
    expect(stock.release).toHaveBeenCalledWith('ord_1');
    expect(carts.markConverted).not.toHaveBeenCalled();
  });
});
