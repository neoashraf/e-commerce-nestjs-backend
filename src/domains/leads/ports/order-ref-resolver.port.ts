import { Injectable, Logger } from '@nestjs/common';

/**
 * Outbound port to ORD for order-reference linkage (FR-LEAD-003, §12.2). Given an order number plus the
 * submitter's phone/customer, resolve it to an order id IF it belongs to the submitter. A mismatch (or an
 * unknown order) returns `{ matched: false }` — the lead still captures the typed reference; the link is
 * simply not made (flagged, not hard-failed). Real impl = ord-core-be order lookup. Stubbed here (returns
 * unresolved) until ORD exposes the lookup — see PR open question.
 */
export interface OrderRefMatchInput {
  orderReference: string;
  submitterPhone: string;
  customerId: string | null;
}

export interface OrderRefMatch {
  /** True only when the reference resolves to an order owned by the submitter. */
  matched: boolean;
  /** The resolved order id when `matched` is true. */
  orderId: string | null;
}

export interface IOrderRefResolver {
  resolve(input: OrderRefMatchInput): Promise<OrderRefMatch>;
}

export const ORDER_REF_RESOLVER = Symbol('IOrderRefResolver');

/** Stub adapter: never resolves a match (linkage deferred to the admin inbox until ORD is wired). */
@Injectable()
export class StubOrderRefResolver implements IOrderRefResolver {
  private readonly logger = new Logger(StubOrderRefResolver.name);

  resolve(input: OrderRefMatchInput): Promise<OrderRefMatch> {
    this.logger.debug(`[stub] order-ref resolve "${input.orderReference}" → unresolved (ORD not wired)`);
    return Promise.resolve({ matched: false, orderId: null });
  }
}
