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

/**
 * An admin reply to deliver to the submitter (FR-LEAD-013, BR-LEAD-8). `channel` is the admin's choice
 * (`email` for long content, `sms` for short updates); the recipient address is the submitter's email/phone.
 */
export interface LeadReplyInput {
  reference: string;
  channel: 'email' | 'sms';
  body: string;
  /** Submitter name, for the reply email greeting (`{{name}}`). */
  recipientName: string;
  recipientEmail: string | null;
  recipientPhone: string;
}

/** Outcome of a reply dispatch (best-effort). `delivered: false` → the lead flags it undelivered (§12.9). */
export interface LeadReplyDelivery {
  channel: 'email' | 'sms';
  /** `queued` when NOTIF accepted the dispatch; `failed` when it could not be sent. */
  status: 'queued' | 'failed';
  delivered: boolean;
}

export interface ILeadNotifier {
  /** Send the submission acknowledgement; returns true if a dispatch was accepted (best-effort). */
  acknowledge(input: LeadAckInput): Promise<boolean>;

  /** Deliver an admin reply to the submitter; reports whether the dispatch was accepted (best-effort). */
  deliverReply(input: LeadReplyInput): Promise<LeadReplyDelivery>;
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

  deliverReply(input: LeadReplyInput): Promise<LeadReplyDelivery> {
    const recipient = input.channel === 'email' ? input.recipientEmail : input.recipientPhone;
    this.logger.log(
      `[stub] lead.reply (${input.channel}) → ${recipient ?? 'n/a'} (ref ${input.reference})`,
    );
    return Promise.resolve({ channel: input.channel, status: 'queued', delivered: true });
  }
}
