import { Injectable } from '@nestjs/common';

import { OrderPaymentMethod } from '../../../orders/domain/order-enums';
import { ZoneCharge } from './delivery-settings.service';

export interface CheckoutSummary {
  subtotal: string;
  discount: string;
  delivery_charge: string;
  cod_surcharge: string;
  vat: string;
  grand_total: string;
}

const toPaisa = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const fromPaisa = (p: number): string => (p / 100).toFixed(2);

/**
 * Checkout summary math (FR-CART-010–016, SRS §15) — one place used by quote + place so they never
 * drift. `grand_total = subtotal − discount + delivery_charge + cod_surcharge`. Delivery is waived when
 * the zone's free-shipping threshold is met. COD surcharge (pct + flat) applies only for the COD method.
 * VAT is **informational + inclusive**: `round(taxable_after_discount × 15 ÷ 115)` — it never changes the
 * grand total (prices are already VAT-inclusive). All math in integer paisa for deterministic Decimal(12,2).
 */
@Injectable()
export class SummaryService {
  private static readonly VAT_RATE_NUM = 15;
  private static readonly VAT_RATE_DEN = 115;

  computeSummary(
    subtotal: string,
    discount: string,
    zone: ZoneCharge,
    method: OrderPaymentMethod,
    freeShipping = false,
  ): CheckoutSummary {
    const subtotalPaisa = toPaisa(subtotal);
    let discountPaisa = Math.min(toPaisa(discount), subtotalPaisa); // never exceed subtotal
    if (discountPaisa < 0) discountPaisa = 0;

    const taxablePaisa = subtotalPaisa - discountPaisa;

    // Delivery charge, waived when the zone's free-shipping threshold is met (FR-CART-012) OR a
    // free_shipping coupon is applied (FR-PROMO-013) — that coupon type carries no subtotal
    // discount, so the waiver here is the only benefit the shopper receives from it.
    let deliveryPaisa = toPaisa(zone.delivery_charge);
    const threshold = zone.free_shipping_threshold;
    if (freeShipping || (threshold !== null && taxablePaisa >= toPaisa(threshold))) {
      deliveryPaisa = 0;
    }

    // COD surcharge — COD only (pct of taxable + flat) (SRS §15: 1% Outside Dhaka).
    let codPaisa = 0;
    if (method === OrderPaymentMethod.COD) {
      const pct = Number(zone.cod_surcharge_pct);
      codPaisa = Math.round((taxablePaisa * pct) / 100) + toPaisa(zone.cod_surcharge_flat);
    }

    const grandPaisa = taxablePaisa + deliveryPaisa + codPaisa;

    // Informational inclusive VAT on the post-discount product subtotal (does not change the total).
    const vatPaisa = Math.round(
      (taxablePaisa * SummaryService.VAT_RATE_NUM) / SummaryService.VAT_RATE_DEN,
    );

    return {
      subtotal: fromPaisa(subtotalPaisa),
      discount: fromPaisa(discountPaisa),
      delivery_charge: fromPaisa(deliveryPaisa),
      cod_surcharge: fromPaisa(codPaisa),
      vat: fromPaisa(vatPaisa),
      grand_total: fromPaisa(grandPaisa),
    };
  }
}
