import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { AdminUserOrmEntity } from '../../../rbac/infrastructure/persistence/typeorm/entities/admin-user.orm-entity';
import { RoleOrmEntity } from '../../../rbac/infrastructure/persistence/typeorm/entities/role.orm-entity';
import { OrderNoteOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order-note.orm-entity';
import { OrderOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order.orm-entity';
import { OrderNotesService } from '../services/order-notes.service';

const makeOrder = (overrides: Partial<OrderOrmEntity> = {}): OrderOrmEntity =>
  ({
    id: 'order-uuid',
    orderNo: 'SO-100245',
    customerId: 'cust-1',
    guestName: null,
    guestEmail: null,
    guestPhone: null,
    addressSnapshot: { recipient_name: 'Sabbir Ahmed', recipient_phone: '+8801712345678', address_line: 'Dhaka' },
    customerNote: null,
    placedAt: new Date('2026-06-03T10:00:00Z'),
    ...overrides,
  } as OrderOrmEntity);

describe('Orders — OrderNotesService', () => {
  let service: OrderNotesService;
  let ordersRepo: { findOne: jest.Mock };
  let notesRepo: { find: jest.Mock; create: jest.Mock; save: jest.Mock };
  let adminsRepo: { createQueryBuilder: jest.Mock };
  let rolesRepo: { createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    ordersRepo = { findOne: jest.fn() };
    notesRepo = { find: jest.fn(), create: jest.fn(), save: jest.fn() };

    const makeQB = (rows: unknown[]) => ({
      whereInIds: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    });

    adminsRepo = { createQueryBuilder: jest.fn() };
    rolesRepo = { createQueryBuilder: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderNotesService,
        { provide: getRepositoryToken(OrderOrmEntity), useValue: ordersRepo },
        { provide: getRepositoryToken(OrderNoteOrmEntity), useValue: notesRepo },
        { provide: getRepositoryToken(AdminUserOrmEntity), useValue: adminsRepo },
        { provide: getRepositoryToken(RoleOrmEntity), useValue: rolesRepo },
      ],
    }).compile();

    service = module.get(OrderNotesService);

    // Default: no admin notes, no roles needed.
    notesRepo.find.mockResolvedValue([]);
    adminsRepo.createQueryBuilder.mockReturnValue(makeQB([]));
    rolesRepo.createQueryBuilder.mockReturnValue(makeQB([]));
  });

  afterEach(() => jest.clearAllMocks());

  // ---------------------------------------------------------------------------
  // getThread
  // ---------------------------------------------------------------------------

  it('throws 404 when the order is not found', async () => {
    ordersRepo.findOne.mockResolvedValue(null);
    await expect(service.getThread('SO-UNKNOWN')).rejects.toThrow(NotFoundException);
  });

  it('returns empty thread when there is no customer_note and no admin notes', async () => {
    ordersRepo.findOne.mockResolvedValue(makeOrder());
    const thread = await service.getThread('SO-100245');
    expect(thread).toEqual([]);
  });

  it('returns customer note first when present', async () => {
    const order = makeOrder({ customerNote: 'Please gift wrap.' });
    ordersRepo.findOne.mockResolvedValue(order);

    const thread = await service.getThread('SO-100245');
    expect(thread).toHaveLength(1);
    expect(thread[0]).toMatchObject({
      id: 'note_customer',
      author_type: 'customer',
      author_name: 'Sabbir Ahmed',
      body: 'Please gift wrap.',
      created_at: '2026-06-03T10:00:00.000Z',
    });
  });

  it('uses guest_name for the customer note author when the order is a guest order', async () => {
    const order = makeOrder({ customerNote: 'Ring the bell.', guestName: 'Guest Karim', customerId: null });
    ordersRepo.findOne.mockResolvedValue(order);

    const thread = await service.getThread('SO-100245');
    expect(thread[0].author_name).toBe('Guest Karim');
  });

  it('includes admin notes with resolved author names after the customer note', async () => {
    const order = makeOrder({ customerNote: 'Fragile.' });
    ordersRepo.findOne.mockResolvedValue(order);

    const noteEntity = {
      id: 'note-uuid-1',
      orderId: 'order-uuid',
      authorAdminId: 'admin-1',
      body: 'Called to confirm.',
      createdAt: new Date('2026-06-04T11:00:00Z'),
    };
    notesRepo.find.mockResolvedValue([noteEntity]);

    const makeQB = (rows: unknown[]) => ({
      whereInIds: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    });
    adminsRepo.createQueryBuilder.mockReturnValue(makeQB([{ id: 'admin-1', fullName: 'Rahim', roleId: 'role-1' }]));
    rolesRepo.createQueryBuilder.mockReturnValue(makeQB([{ id: 'role-1', name: 'Order Manager' }]));

    const thread = await service.getThread('SO-100245');
    expect(thread).toHaveLength(2);
    expect(thread[0].author_type).toBe('customer');
    expect(thread[1]).toMatchObject({
      id: 'note-uuid-1',
      author_type: 'admin',
      author_name: 'Rahim (Order Manager)',
      body: 'Called to confirm.',
      created_at: '2026-06-04T11:00:00.000Z',
    });
  });

  it('falls back to "Admin" when the author admin id is not found', async () => {
    const order = makeOrder();
    ordersRepo.findOne.mockResolvedValue(order);

    const noteEntity = {
      id: 'note-uuid-x',
      orderId: 'order-uuid',
      authorAdminId: 'unknown-admin',
      body: 'Mystery note.',
      createdAt: new Date('2026-06-05T08:00:00Z'),
    };
    notesRepo.find.mockResolvedValue([noteEntity]);

    const makeQB = (rows: unknown[]) => ({
      whereInIds: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    });
    adminsRepo.createQueryBuilder.mockReturnValue(makeQB([]));
    rolesRepo.createQueryBuilder.mockReturnValue(makeQB([]));

    const thread = await service.getThread('SO-100245');
    expect(thread[0].author_name).toBe('Admin');
  });

  it('sorts thread chronologically even when admin note is older than placed_at', async () => {
    // Edge case: customer note has placedAt, admin note has an earlier timestamp (shouldn't happen,
    // but the sort must still be chronological).
    const order = makeOrder({ customerNote: 'Note.', placedAt: new Date('2026-06-04T12:00:00Z') });
    ordersRepo.findOne.mockResolvedValue(order);

    const noteEntity = {
      id: 'note-early',
      orderId: 'order-uuid',
      authorAdminId: null,
      body: 'Admin note from before placement (test only).',
      createdAt: new Date('2026-06-04T09:00:00Z'),
    };
    notesRepo.find.mockResolvedValue([noteEntity]);

    const thread = await service.getThread('SO-100245');
    expect(thread[0].created_at < thread[1].created_at).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // addAdminNote
  // ---------------------------------------------------------------------------

  it('throws 404 when adding a note to an unknown order', async () => {
    ordersRepo.findOne.mockResolvedValue(null);
    await expect(service.addAdminNote('SO-UNKNOWN', 'Note.', 'admin-1')).rejects.toThrow(NotFoundException);
  });

  it('saves the note and returns an attributed entry', async () => {
    const order = makeOrder();
    ordersRepo.findOne.mockResolvedValue(order);

    const saved = { id: 'new-note-id', orderId: 'order-uuid', authorAdminId: 'admin-1', body: 'Confirmed.', createdAt: new Date('2026-06-06T10:00:00Z') };
    notesRepo.create.mockReturnValue(saved);
    notesRepo.save.mockResolvedValue(saved);

    const makeQB = (rows: unknown[]) => ({
      whereInIds: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    });
    adminsRepo.createQueryBuilder.mockReturnValue(makeQB([{ id: 'admin-1', fullName: 'Saber', roleId: 'r1' }]));
    rolesRepo.createQueryBuilder.mockReturnValue(makeQB([{ id: 'r1', name: 'Super Admin' }]));

    const result = await service.addAdminNote('SO-100245', 'Confirmed.', 'admin-1');
    expect(result.id).toBe('new-note-id');
    expect(result.entry).toMatchObject({
      id: 'new-note-id',
      author_type: 'admin',
      author_name: 'Saber (Super Admin)',
      body: 'Confirmed.',
    });
  });
});
