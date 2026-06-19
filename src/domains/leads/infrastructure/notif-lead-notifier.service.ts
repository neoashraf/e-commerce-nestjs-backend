import { Injectable, Logger } from '@nestjs/common';

import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import {
  ILeadNotifier,
  LeadAckInput,
  LeadReplyDelivery,
  LeadReplyInput,
} from '../ports/lead-notifier.port';

/**
 * Real lead notifier (FR-LEAD-005, FR-LEAD-013) — delivers the submission acknowledgement and admin
 * replies by **email**, through the same NOTIF path the admin-invite mail uses
 * (`NotificationDispatchService.sendTransactionalEmail` → SmtpEmailAdapter).
 *
 * Email-only (client decision): SMS is never dispatched. A submitter without an email simply gets the
 * on-screen reference (ack skipped); an admin reply to a no-email submitter is reported undelivered so
 * the inbox flags it (§12.9). All delivery is best-effort — failures are swallowed (logged), never thrown,
 * so a lead/reply is never lost on a transport hiccup (NFR reliability).
 */
@Injectable()
export class NotifLeadNotifier implements ILeadNotifier {
  private readonly logger = new Logger(NotifLeadNotifier.name);

  constructor(private readonly dispatch: NotificationDispatchService) {}

  async acknowledge(input: LeadAckInput): Promise<boolean> {
    if (!input.email) {
      this.logger.log(`lead.received_ack skipped for ${input.reference} (no email; on-screen reference only).`);
      return false;
    }
    try {
      await this.dispatch.sendTransactionalEmail({
        email: input.email,
        eventType: 'lead.received_ack',
        variables: { name: input.subjectName, ticket_no: input.reference },
        idempotencyKey: `lead.received_ack:${input.reference}`,
      });
      return true;
    } catch (err) {
      this.logger.error(`lead.received_ack dispatch failed for ${input.reference}`, (err as Error)?.stack);
      return false;
    }
  }

  async deliverReply(input: LeadReplyInput): Promise<LeadReplyDelivery> {
    // Email-only: only the email channel is delivered; SMS (or a missing email) is flagged undelivered.
    if (input.channel !== 'email' || !input.recipientEmail) {
      this.logger.warn(
        `lead.reply not delivered for ${input.reference} (channel=${input.channel}, email=${input.recipientEmail ?? 'none'}).`,
      );
      return { channel: input.channel, status: 'failed', delivered: false };
    }
    try {
      await this.dispatch.sendTransactionalEmail({
        email: input.recipientEmail,
        eventType: 'lead.reply',
        variables: { name: input.recipientName, ticket_no: input.reference, reply_body: input.body },
      });
      return { channel: 'email', status: 'queued', delivered: true };
    } catch (err) {
      this.logger.error(`lead.reply dispatch failed for ${input.reference}`, (err as Error)?.stack);
      return { channel: 'email', status: 'failed', delivered: false };
    }
  }
}
