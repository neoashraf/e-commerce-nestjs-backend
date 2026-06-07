import { Injectable, Logger } from '@nestjs/common';

/** A line to decrement/restock, by variant (SKU) + quantity. */
export interface StockLine {
  variantId: string;
  quantity: number;
}

/**
 * Outbound port to INV for order stock coordination (FR-ORD-030–032). The real impl is the
 * inv-reservations-be `ReservationService` (decrement on confirmation, restock/scrap on cancel/
 * exchange-return). All operations are **idempotent per order** so repeated transitions never
 * double-adjust stock (BR-ORD-6). Until wired in-process, {@link StubStockCoordinator} logs only.
 */
export interface IStockCoordinator {
  /** Convert an order's reservation to a sale on confirmation (idempotent per order). */
  decrement(orderId: string): Promise<void>;
  /** Release an order's held reservation (e.g. on auto-cancel of an unpaid online order). */
  release(orderId: string): Promise<void>;
  /** Restock (resellable) or scrap (defective) an order's items on cancel/exchange-return. */
  restock(orderId: string, disposition: 'restocked' | 'scrapped', lines?: StockLine[]): Promise<void>;
}

export const STOCK_COORDINATOR = Symbol('IStockCoordinator');

/**
 * Default no-op stub for the INV seam until inv-reservations-be is wired in-process. Logs the intent
 * so flows are observable in dev/test; swap for an inv-backed adapter at integration (BW5 CART step).
 */
@Injectable()
export class StubStockCoordinator implements IStockCoordinator {
  private readonly logger = new Logger(StubStockCoordinator.name);

  async decrement(orderId: string): Promise<void> {
    this.logger.log(`[stub] INV decrement for order ${orderId}`);
  }

  async release(orderId: string): Promise<void> {
    this.logger.log(`[stub] INV release for order ${orderId}`);
  }

  async restock(orderId: string, disposition: 'restocked' | 'scrapped'): Promise<void> {
    this.logger.log(`[stub] INV ${disposition} for order ${orderId}`);
  }
}
