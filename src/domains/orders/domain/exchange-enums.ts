/**
 * Exchange / replacement value objects (SRS 06 §5.6 / §8 Exchange). The post-delivery exchange engine:
 * a customer requests a replacement for a delivered item; quality-defect claims pass QA; an approved
 * request issues a replacement of equal-or-higher value (the customer pays any difference) — never cash
 * back (BR-ORD-8). Defined in the domain layer so the service / eligibility / DTOs share one source.
 */

/** Why the customer wants to exchange the item (SRS 06 §8 Exchange.reason). */
export enum ExchangeReason {
  WRONG_SIZE = 'wrong_size',
  QUALITY_DEFECT = 'quality_defect',
  OTHER = 'other',
}

/** Exchange request lifecycle (SRS 06 §8 Exchange.status). */
export enum ExchangeStatus {
  REQUESTED = 'requested',
  UNDER_QA_REVIEW = 'under_qa_review',
  APPROVED = 'approved',
  REPLACEMENT_ISSUED = 'replacement_issued',
  COMPLETED = 'completed',
  REJECTED = 'rejected',
}

/** Disposition of the returned item once the replacement is issued (SRS 06 §8, FR-ORD-049). */
export enum ReturnedItemDisposition {
  RESTOCKED = 'restocked',
  SCRAPPED = 'scrapped',
}

/**
 * Machine reason returned with `409 EXCHANGE_INELIGIBLE` when a request is rejected up-front
 * (FR-ORD-046; contract: `reason` ∈ these values).
 */
export enum ExchangeIneligibleReason {
  OUTSIDE_WINDOW = 'outside_window',
  NON_EXCHANGEABLE_ITEM = 'non_exchangeable_item',
  DISCOUNT_PURCHASED = 'discount_purchased',
  ALREADY_EXCHANGED = 'already_exchanged',
  NOT_DELIVERED = 'not_delivered',
}

/** Default exchange window in days from delivery (FR-ORD-045, BR-ORD-9). */
export const EXCHANGE_WINDOW_DAYS = 30;

/** QA target for quality-defect claims, in working days (FR-ORD-047). */
export const EXCHANGE_QA_WORKING_DAYS = 5;
