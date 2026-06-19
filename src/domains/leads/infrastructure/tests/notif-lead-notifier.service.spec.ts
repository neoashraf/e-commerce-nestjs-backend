import { NotificationDispatchService } from '../../../notifications/notification-dispatch.service';
import { NotifLeadNotifier } from '../notif-lead-notifier.service';
import { LeadAckInput, LeadReplyInput } from '../../ports/lead-notifier.port';

const ackInput = (over: Partial<LeadAckInput> = {}): LeadAckInput => ({
  reference: 'HLP-20001',
  type: 'general',
  subjectName: 'Sabbir',
  phone: '+8801712345678',
  email: 'sabbir@example.com',
  ...over,
});

const replyInput = (over: Partial<LeadReplyInput> = {}): LeadReplyInput => ({
  reference: 'HLP-20001',
  channel: 'email',
  body: 'Here is the help you asked for.',
  recipientName: 'Sabbir',
  recipientEmail: 'sabbir@example.com',
  recipientPhone: '+8801712345678',
  ...over,
});

describe('LEAD — NotifLeadNotifier', () => {
  let dispatch: { sendTransactionalEmail: jest.Mock; dispatch: jest.Mock };
  let notifier: NotifLeadNotifier;

  beforeEach(() => {
    dispatch = { sendTransactionalEmail: jest.fn().mockResolvedValue({ notifications: [] }), dispatch: jest.fn() };
    notifier = new NotifLeadNotifier(dispatch as unknown as NotificationDispatchService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── acknowledge ──────────────────────────────────────────────────────────
  it('dispatches a lead.received_ack EMAIL with the reference, and no SMS', async () => {
    const result = await notifier.acknowledge(ackInput());

    expect(result).toBe(true);
    expect(dispatch.sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'sabbir@example.com',
        eventType: 'lead.received_ack',
        variables: { name: 'Sabbir', ticket_no: 'HLP-20001' },
      }),
    );
    // Email-only: the SMS-capable generic dispatch is never used.
    expect(dispatch.dispatch).not.toHaveBeenCalled();
  });

  it('skips the ack (returns false, no dispatch) for a submitter with no email', async () => {
    const result = await notifier.acknowledge(ackInput({ email: null }));
    expect(result).toBe(false);
    expect(dispatch.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('returns false (never throws) when the ack dispatch fails', async () => {
    dispatch.sendTransactionalEmail.mockRejectedValue(new Error('smtp down'));
    await expect(notifier.acknowledge(ackInput())).resolves.toBe(false);
  });

  // ── deliverReply ─────────────────────────────────────────────────────────
  it('dispatches a lead.reply EMAIL and reports queued/delivered', async () => {
    const result = await notifier.deliverReply(replyInput());

    expect(result).toEqual({ channel: 'email', status: 'queued', delivered: true });
    expect(dispatch.sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'sabbir@example.com',
        eventType: 'lead.reply',
        variables: { name: 'Sabbir', ticket_no: 'HLP-20001', reply_body: 'Here is the help you asked for.' },
      }),
    );
  });

  it('flags a reply undelivered (no dispatch) when the submitter has no email', async () => {
    const result = await notifier.deliverReply(replyInput({ recipientEmail: null }));
    expect(result).toEqual({ channel: 'email', status: 'failed', delivered: false });
    expect(dispatch.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('does not dispatch on the SMS channel (email-only); flags undelivered', async () => {
    const result = await notifier.deliverReply(replyInput({ channel: 'sms' }));
    expect(result).toEqual({ channel: 'sms', status: 'failed', delivered: false });
    expect(dispatch.sendTransactionalEmail).not.toHaveBeenCalled();
  });
});
