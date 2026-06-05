/**
 * Stock movement types (SRS 11 §8 StockMovement.type, FR-INV-050). Every quantity change is one of
 * these. Admin-driven: `receive`, `adjust`, `correction`. System-driven (order coordination):
 * `reserve`, `release`, `sale`, `restock`, `scrap`.
 */
export enum StockMovementType {
  RECEIVE = 'receive',
  ADJUST = 'adjust',
  CORRECTION = 'correction',
  RESERVE = 'reserve',
  RELEASE = 'release',
  SALE = 'sale',
  RESTOCK = 'restock',
  SCRAP = 'scrap',
}

/** Who caused a movement (SRS 11 §8 StockMovement.actor_type). */
export enum StockMovementActorType {
  ADMIN = 'admin',
  SYSTEM = 'system',
}
