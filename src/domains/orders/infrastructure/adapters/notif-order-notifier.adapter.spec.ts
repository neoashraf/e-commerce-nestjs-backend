import { DataSource } from 'typeorm';

import { AdminNotificationService } from '../../../notifications/admin-notification.service';
import { NotificationDispatchService } from '../../../notifications/notification-dispatch.service';
import { OrderNotificationContext } from '../../application/ports/order-notifier.port';
import { NotifOrderNotifier } from './notif-order-notifier.adapter';

describe('Orders — NotifOrderNotifier (payment received email)', () => {
  let adminNotifications: { emitOrderPlaced: jest.Mock };
  let dispatch: { dispatch: jest.Mock };
  let dataSource: { query: jest.Mock };
  let notifier: NotifOrderNotifier;

  beforeEach(() => {
    adminNotifications = { emitOrderPlaced: jest.fn().mockResolvedValue(undefined) };
    dispatch = { dispatch: jest.fn().mockResolvedValue({ notifications: [], deduplicated: false }) };
    dataSource = { query: jest.fn().mockResolvedValue([]) };
    notifier = new NotifOrderNotifier(
      adminNotifications as unknown as AdminNotificationService,
      dispatch as unknown as NotificationDispatchService,
      dataSource as unknown as DataSource,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('emails the guest using the checkout email on successful payment (FR-ORD-050)', async () => {
    const ctx: OrderNotificationContext = {
      orderNo: 'SO-100200',
      orderId: 'ord-1',
      customerId: null,
      guestEmail: 'guest@example.com',
      customerName: 'Guest Buyer',
      grandTotal: '4500.00',
    };
    await notifier.notify('order.payment_received', ctx);

    expect(dataSource.query).not.toHaveBeenCalled(); // guest → no customers lookup
    expect(dispatch.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'payment.received',
        channels: ['email'],
        recipient: expect.objectContaining({ email: 'guest@example.com' }),
        variables: expect.objectContaining({ name: 'Guest Buyer', order_no: 'SO-100200', amount: '4500.00' }),
        relatedEntity: { type: 'order', id: 'ord-1' },
        idempotencyKey: 'payment-received-email:SO-100200',
      }),
    );
  });

  it('resolves a registered buyer’s email + name from the customers table', async () => {
    dataSource.query.mockResolvedValue([{ email: 'reg@example.com', full_name: 'Registered User' }]);
    const ctx: OrderNotificationContext = {
      orderNo: 'SO-100201',
      orderId: 'ord-2',
      customerId: 'cust-9',
      guestEmail: null,
      customerName: 'Address Recipient',
      grandTotal: '9000.00',
    };
    await notifier.notify('order.payment_received', ctx);

    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('FROM customers'), ['cust-9']);
    expect(dispatch.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: { customerId: 'cust-9', email: 'reg@example.com' },
        variables: expect.objectContaining({ name: 'Registered User', order_no: 'SO-100201' }),
      }),
    );
  });

  it('skips the email when no address is on file (guest without email)', async () => {
    const ctx: OrderNotificationContext = {
      orderNo: 'SO-100202',
      orderId: 'ord-3',
      customerId: null,
      guestEmail: null,
      customerName: 'No Email Guest',
      grandTotal: '1200.00',
    };
    await notifier.notify('order.payment_received', ctx);
    expect(dispatch.dispatch).not.toHaveBeenCalled();
  });

  it('never throws when NOTIF dispatch fails (best-effort, BR-ORD-12)', async () => {
    dispatch.dispatch.mockRejectedValue(new Error('notif down'));
    const ctx: OrderNotificationContext = {
      orderNo: 'SO-100203',
      orderId: 'ord-4',
      customerId: null,
      guestEmail: 'guest@example.com',
      customerName: 'Guest',
      grandTotal: '500.00',
    };
    await expect(notifier.notify('order.payment_received', ctx)).resolves.toBeUndefined();
  });

  it('still raises the in-app admin alert on order.placed (unchanged)', async () => {
    const ctx: OrderNotificationContext = {
      orderNo: 'SO-100204',
      orderId: 'ord-5',
      grandTotal: '7000.00',
      itemCount: 2,
      customerName: 'Buyer',
      paymentMethod: 'bkash',
    };
    await notifier.notify('order.placed', ctx);
    expect(adminNotifications.emitOrderPlaced).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'ord-5', orderNo: 'SO-100204', itemCount: 2 }),
    );
    expect(dispatch.dispatch).not.toHaveBeenCalled();
  });
});
