import { Injectable, Logger } from '@nestjs/common';

/**
 * Outbound port to NOTIF for lead acknowledgements/replies (FR-LEAD-005, BR-LEAD-4). The submission
 * acknowledgement ("we received your enquiry, ref HLP-…") is sent here, best-effort: a delivery failure
 * must not lose the lead (NFR §14 reliability) — `acknowledge()` swallows errors and reports whether a
 * dispatch was attempted/accepted.
 *
 * Real impl = notif-dispatch-be (`lead.received_ack` event). Stubbed here until NOTIF exposes that event —
 * see PR open question. The stub logs and reports "sent" so the storefront success state is exercised.
 */
export interface LeadAckInput {
  reference: string;
  type: string;
  subjectName: string;
  phone: string;
  email: string | null;
}

export interface ILeadNotifier {
  /** Send the submission acknowledgement; returns true if a dispatch was accepted (best-effort). */
  acknowledge(input: LeadAckInput): Promise<boolean>;
}

export const LEAD_NOTIFIER = Symbol('ILeadNotifier');

/**
 * Stub adapter: logs the acknowledgement and reports success without touching NOTIF. Replace by wiring
 * the real `NotificationDispatchService` (`lead.received_ack`) once that event/template exists.
 */
@Injectable()
export class StubLeadNotifier implements ILeadNotifier {
  private readonly logger = new Logger(StubLeadNotifier.name);

  acknowledge(input: LeadAckInput): Promise<boolean> {
    this.logger.log(
      `[stub] lead.received_ack → ${input.email ?? input.phone} (ref ${input.reference}, type ${input.type})`,
    );
    return Promise.resolve(true);
  }
}
