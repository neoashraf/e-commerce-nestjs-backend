import { Injectable } from '@nestjs/common';

import { ReservationService } from '../../../inventory/application/reservation.service';
import {
  OrderCreationService,
  PlaceOrderSnapshot,
} from '../../../orders/application/services/order-creation.service';
import { PaymentsService } from '../../../payments/application/services/payments.service';
import { PaymentMethod } from '../../../payments/domain/payment-enums';
import {
  CouponEngineService,
  ValidateResult,
} from '../../../promotions/application/services/coupon-engine.service';
import { CartLine } from '../../../promotions/application/eligibility';

// ---------------------------------------------------------------------------
// StockReserver (INV) — FR-CART-033
// ---------------------------------------------------------------------------

export interface ReserveLineInput {
  variantId: string;
  quantity: number;
}

export interface IStockReserver {
  reserve(orderId: string, lines: ReserveLineInput[]): Promise<void>;
  release(orderId: string): Promise<void>;
}

export const STOCK_RESERVER = Symbol('IStockReserver');

/** Real INV adapter — wraps inv-reservations-be ReservationService (no-oversell, idempotent per order). */
@Injectable()
export class InventoryStockReserver implements IStockReserver {
  constructor(private readonly reservations: ReservationService) {}

  async reserve(orderId: string, lines: ReserveLineInput[]): Promise<void> {
    await this.reservations.reserve(orderId, lines);
  }

  async release(orderId: string): Promise<void> {
    await this.reservations.release(orderId);
  }
}

// ---------------------------------------------------------------------------
// OrderPlacer (ORD) — FR-CART-034
// ---------------------------------------------------------------------------

export interface IOrderPlacer {
  place(snapshot: PlaceOrderSnapshot): Promise<{ orderId: string; orderNo: string; status: string }>;
}

export const ORDER_PLACER = Symbol('IOrderPlacer');

/** Real ORD adapter — wraps ord-core-be OrderCreationService (snapshot + numbering + idempotency). */
@Injectable()
export class OrdersOrderPlacer implements IOrderPlacer {
  constructor(private readonly orders: OrderCreationService) {}

  place(snapshot: PlaceOrderSnapshot) {
    return this.orders.place(snapshot);
  }
}

// ---------------------------------------------------------------------------
// PaymentInitiator (PAY) — FR-CART-035
// ---------------------------------------------------------------------------

export interface InitiatePaymentInput {
  orderId: string;
  method: PaymentMethod;
}

export interface PaymentInitiationResult {
  action: 'redirect' | 'none';
  status: string;
  redirectUrl?: string;
}

export interface IPaymentInitiator {
  initiate(input: InitiatePaymentInput): Promise<PaymentInitiationResult>;
}

export const PAYMENT_INITIATOR = Symbol('IPaymentInitiator');

/** Real PAY adapter — wraps pay-core-be PaymentsService (COD → cod_pending; online → redirect). */
@Injectable()
export class PaymentsPaymentInitiator implements IPaymentInitiator {
  constructor(private readonly payments: PaymentsService) {}

  async initiate(input: InitiatePaymentInput): Promise<PaymentInitiationResult> {
    const result = await this.payments.initiate({ order_id: input.orderId, method: input.method });
    return { action: result.action, status: result.status, redirectUrl: result.redirect_url };
  }
}

// ---------------------------------------------------------------------------
// CouponValidator (PROMO) — FR-CART-022/032
// ---------------------------------------------------------------------------

export interface CouponValidateInput {
  code: string;
  identity: { customer_id?: string | null; guest_phone?: string | null };
  lines: CartLine[];
  subtotal: string;
}

export interface ICouponValidator {
  validate(input: CouponValidateInput): Promise<ValidateResult>;
  redeem(input: {
    code: string;
    orderId: string;
    identity: { customer_id?: string | null; guest_phone?: string | null };
    discountAmount: string;
  }): Promise<void>;
}

export const COUPON_VALIDATOR = Symbol('ICouponValidator');

/** Real PROMO adapter — wraps promo-engine-be CouponEngineService (validate + redeem at placement). */
@Injectable()
export class PromoCouponValidator implements ICouponValidator {
  constructor(private readonly engine: CouponEngineService) {}

  validate(input: CouponValidateInput): Promise<ValidateResult> {
    return this.engine.validate({
      code: input.code,
      identity: input.identity,
      cart: { lines: input.lines, subtotal: input.subtotal },
    });
  }

  async redeem(input: {
    code: string;
    orderId: string;
    identity: { customer_id?: string | null; guest_phone?: string | null };
    discountAmount: string;
  }): Promise<void> {
    await this.engine.redeem({
      code: input.code,
      order_id: input.orderId,
      identity: input.identity,
      discount_amount: input.discountAmount,
    });
  }
}
