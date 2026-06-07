/**
 * Order fulfilment status — the full lifecycle (SRS 06 §4 / §8). `pending_payment → confirmed →
 * processing → packed → shipped → out_for_delivery → delivered`, plus branch states `cancelled`,
 * `refunded` (prepaid cancellation), `exchange_requested`, `exchanged`. Defined in full here so the
 * fulfilment / exchange / tracking slices reuse the same enum (ord-core owns the type).
 */
export enum OrderStatus {
  PENDING_PAYMENT = 'pending_payment',
  CONFIRMED = 'confirmed',
  PROCESSING = 'processing',
  PACKED = 'packed',
  SHIPPED = 'shipped',
  OUT_FOR_DELIVERY = 'out_for_delivery',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
  EXCHANGE_REQUESTED = 'exchange_requested',
  EXCHANGED = 'exchanged',
}

/** Payment method on the order (SRS 06 §8 Order.payment_method). */
export enum OrderPaymentMethod {
  COD = 'cod',
  BKASH = 'bkash',
  SSLCOMMERZ = 'sslcommerz',
}

/** Payment state mirrored from PAY (SRS 06 §8 Order.payment_state). */
export enum OrderPaymentState {
  UNPAID = 'unpaid',
  COD_PENDING = 'cod_pending',
  PAID = 'paid',
  COD_COLLECTED = 'cod_collected',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded',
}

/** Delivery zone (shared with CART; SRS 06 §8 Order.delivery_zone). */
export enum OrderDeliveryZone {
  INSIDE_DHAKA = 'inside_dhaka',
  NEAR_DHAKA = 'near_dhaka',
  OUTSIDE_DHAKA = 'outside_dhaka',
}

/** Actor on a status-history entry (SRS 06 §8 OrderStatusHistory.actor_type). */
export enum OrderActorType {
  CUSTOMER = 'customer',
  ADMIN = 'admin',
  SYSTEM = 'system',
}
