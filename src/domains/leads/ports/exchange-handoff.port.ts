import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';

/**
 * Outbound port to ORD for the claim → exchange/cancel handoff (FR-LEAD-016, BR-LEAD-3). When an admin
 * actions a `claim_return` lead, LEAD asks ORD to initiate a post-delivery **exchange** or a pre-dispatch
 * **cancellation** for the linked order item — there is NO cash-refund action (exchange-only policy). The
 * resulting exchange id (when an exchange is initiated) is recorded as linkage on the lead.
 *
 * Real impl = ord-exchange-be (`POST /admin/exchanges`) + ord-fulfilment-be (pre-dispatch cancel). Stubbed
 * here until ORD exposes an in-process handoff entry point — see PR open question. The stub mints a
 * deterministic-looking exchange id so the inbox flow + linkage are exercised end-to-end.
 */
export interface ExchangeHandoffInput {
  /** The lead the handoff is recorded against. */
  leadReference: string;
  /** The order the claim concerns (human-readable order number, e.g. `SO-100245`). */
  orderReference: string;
  /** The order item being exchanged/cancelled. */
  orderItemId: string;
  /** `exchange` (post-delivery) or `cancel` (pre-dispatch). */
  action: 'exchange' | 'cancel';
  /** Claim reason carried through to ORD (e.g. `wrong_size`). */
  reason: string;
  /** Admin initiating the handoff (for ORD audit). */
  actorAdminId: string;
}

export interface ExchangeHandoffResult {
  /** `exchange_initiated` for an exchange; `cancellation_initiated` for a pre-dispatch cancel. */
  handoff: 'exchange_initiated' | 'cancellation_initiated';
  /** The ORD exchange id when an exchange was initiated; `null` for a cancellation. */
  exchangeId: string | null;
}

export interface IExchangeHandoff {
  initiate(input: ExchangeHandoffInput): Promise<ExchangeHandoffResult>;
}

export const EXCHANGE_HANDOFF = Symbol('IExchangeHandoff');

/**
 * Stub adapter: logs the handoff and mints an exchange id for the `exchange` action (none for `cancel`),
 * without touching ORD. Replace by wiring the real ORD exchange/cancel entry point once it is exposed.
 */
@Injectable()
export class StubExchangeHandoff implements IExchangeHandoff {
  private readonly logger = new Logger(StubExchangeHandoff.name);

  initiate(input: ExchangeHandoffInput): Promise<ExchangeHandoffResult> {
    this.logger.log(
      `[stub] lead ${input.leadReference} → ORD ${input.action} for order ${input.orderReference} ` +
        `item ${input.orderItemId} (reason ${input.reason})`,
    );
    if (input.action === 'cancel') {
      return Promise.resolve({ handoff: 'cancellation_initiated', exchangeId: null });
    }
    return Promise.resolve({ handoff: 'exchange_initiated', exchangeId: randomUUID() });
  }
}
