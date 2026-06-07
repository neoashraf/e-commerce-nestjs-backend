/**
 * Lifecycle of a stock reservation (SRS 11 §8 StockReservation.status, FR-INV-020–023/030).
 * `held` at placement → `consumed` on decrement (sale), `released` on release, or `expired` by the
 * sweep when the hold passes `expires_at`.
 */
export enum ReservationStatus {
  HELD = 'held',
  CONSUMED = 'consumed',
  RELEASED = 'released',
  EXPIRED = 'expired',
}
