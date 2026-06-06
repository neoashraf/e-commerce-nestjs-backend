import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { CartActor, CartService } from '../cart/cart.service';
import { CATALOG_READER } from '../ports/catalog-reader.port';
import { STOCK_CHECKER } from '../ports/stock-checker.port';
import { CartStatus } from '../../domain/enums/cart-status.enum';
import { CartOrmEntity } from '../../infrastructure/persistence/typeorm/entities/cart.orm-entity';
import { CartItemOrmEntity } from '../../infrastructure/persistence/typeorm/entities/cart-item.orm-entity';

const variant = (o: Record<string, unknown> = {}) => ({
  variant_id: 'v1',
  product_id: 'p1',
  sku_code: 'PRED-BLK-42',
  title: 'Predator Elite',
  options: { color: 'Black', size: '42' },
  image: 'https://x/thumb.webp',
  effective_unit_price: '12500.00',
  sellable: true,
  ...o,
});

const GUEST: CartActor = { customerId: null, cartToken: 'guesttok_1' };
const CUSTOMER: CartActor = { customerId: 'c1', cartToken: null };

describe('Cart — CartService', () => {
  let service: CartService;
  let carts: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let items: { findOne: jest.Mock; find: jest.Mock; count: jest.Mock; create: jest.Mock; save: jest.Mock; remove: jest.Mock; delete: jest.Mock };
  let catalog: { getVariant: jest.Mock };
  let stock: { availabilityFor: jest.Mock; availableFor: jest.Mock };

  beforeEach(async () => {
    carts = {
      findOne: jest.fn().mockResolvedValue({ id: 'cart_1', cartToken: 'guesttok_1', status: CartStatus.ACTIVE }),
      create: jest.fn().mockImplementation((c) => c),
      save: jest.fn().mockImplementation((c) => Promise.resolve({ id: 'cart_1', ...c })),
    };
    items = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation((i) => i),
      save: jest.fn().mockImplementation((i) => Promise.resolve({ id: i.id ?? 'ci_1', ...i })),
      remove: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    catalog = { getVariant: jest.fn().mockResolvedValue(variant()) };
    stock = {
      availabilityFor: jest.fn().mockResolvedValue(new Map([['v1', { available: 5, status: 'in_stock' }]])),
      availableFor: jest.fn().mockResolvedValue(5),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: getRepositoryToken(CartOrmEntity), useValue: carts },
        { provide: getRepositoryToken(CartItemOrmEntity), useValue: items },
        { provide: CATALOG_READER, useValue: catalog },
        { provide: STOCK_CHECKER, useValue: stock },
      ],
    }).compile();

    service = module.get(CartService);
  });

  afterEach(() => jest.clearAllMocks());

  // --- add ---

  it('should add a new line and return the (existing guest) token', async () => {
    const result = await service.addItem(GUEST, 'v1', 1);
    expect(result.quantity).toBe(1);
    expect(result.capped).toBe(false);
    expect(result.cart_token).toBe('guesttok_1');
  });

  it('should increment the quantity when the same variant is added again', async () => {
    items.findOne.mockResolvedValue({ id: 'ci_1', cartId: 'cart_1', variantId: 'v1', quantity: 2 });
    const result = await service.addItem(GUEST, 'v1', 1);
    expect(items.save).toHaveBeenCalledWith(expect.objectContaining({ quantity: 3 }));
    expect(result.quantity).toBe(3);
  });

  it('should reject adding a non-sellable variant with 400', async () => {
    catalog.getVariant.mockResolvedValue(variant({ sellable: false }));
    await expect(service.addItem(GUEST, 'v1', 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should mint a new guest cart + token when neither identity is present', async () => {
    carts.findOne.mockResolvedValue(null);
    carts.save.mockImplementation((c) => Promise.resolve({ id: 'cart_new', ...c }));
    const result = await service.addItem({ customerId: null, cartToken: null }, 'v1', 1);
    expect(result.cart_token).toMatch(/^guesttok_/);
  });

  it('should raise INSUFFICIENT_STOCK when the desired quantity exceeds available', async () => {
    stock.availableFor.mockResolvedValue(1);
    await expect(service.addItem(GUEST, 'v1', 3)).rejects.toMatchObject({
      response: { code: 'INSUFFICIENT_STOCK', available: 1 },
    });
  });

  it('should enforce the per-line max quantity (400)', async () => {
    items.findOne.mockResolvedValue({ id: 'ci_1', cartId: 'cart_1', variantId: 'v1', quantity: 9 });
    await expect(service.addItem(GUEST, 'v1', 5)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should enforce the distinct-line cap (400)', async () => {
    items.count.mockResolvedValue(50);
    await expect(service.addItem(GUEST, 'v2', 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  // --- update / remove / clear ---

  it('should remove the line when updating quantity to 0', async () => {
    items.findOne.mockResolvedValue({ id: 'ci_1', cartId: 'cart_1', variantId: 'v1', quantity: 2 });
    const result = await service.updateItem(GUEST, 'ci_1', 0);
    expect(result).toEqual({ removed: true });
    expect(items.remove).toHaveBeenCalled();
  });

  it('should clear all lines from the cart', async () => {
    await service.clear(GUEST);
    expect(items.delete).toHaveBeenCalledWith({ cartId: 'cart_1' });
  });

  // --- view ---

  it('should compute a live subtotal from the catalog effective price', async () => {
    items.find.mockResolvedValue([
      { id: 'ci_1', cartId: 'cart_1', productId: 'p1', variantId: 'v1', quantity: 2 },
    ]);
    const view = await service.getCart(GUEST);
    expect(view.items[0].line_total).toBe('25000.00');
    expect(view.summary.subtotal).toBe('25000.00');
    expect(view.items[0].options).toEqual({ color: 'Black', size: '42' });
  });

  it('should surface availability out_of_stock for a now-unsellable line', async () => {
    items.find.mockResolvedValue([
      { id: 'ci_1', cartId: 'cart_1', productId: 'p1', variantId: 'v1', quantity: 1 },
    ]);
    catalog.getVariant.mockResolvedValue(variant({ sellable: false }));
    const view = await service.getCart(GUEST);
    expect(view.items[0].availability).toBe('out_of_stock');
  });

  // --- merge ---

  it('should merge a guest cart into the customer cart, summing and capping', async () => {
    // customer cart resolve, then guest cart lookup
    carts.findOne
      .mockResolvedValueOnce({ id: 'cart_cust', customerId: 'c1', status: CartStatus.ACTIVE }) // resolveOrCreate->resolveExisting
      .mockResolvedValueOnce({ id: 'cart_guest', cartToken: 'guesttok_1', status: CartStatus.ACTIVE }); // guest lookup
    items.find
      .mockResolvedValueOnce([{ id: 'g1', cartId: 'cart_guest', productId: 'p1', variantId: 'v1', quantity: 2 }]) // guest items
      .mockResolvedValueOnce([]); // buildView items
    items.findOne.mockResolvedValue(null); // no existing customer line for v1
    const result = await service.merge(CUSTOMER, 'guesttok_1');
    expect(result.merged_lines).toBe(1);
    expect(items.save).toHaveBeenCalledWith(expect.objectContaining({ variantId: 'v1', quantity: 2 }));
  });

  it('should be a no-op merge for an unknown guest token (idempotent)', async () => {
    carts.findOne
      .mockResolvedValueOnce({ id: 'cart_cust', customerId: 'c1', status: CartStatus.ACTIVE })
      .mockResolvedValueOnce(null); // guest token not found
    items.find.mockResolvedValue([]);
    const result = await service.merge(CUSTOMER, 'unknown');
    expect(result.merged_lines).toBe(0);
  });
});
