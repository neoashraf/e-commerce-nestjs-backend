import { DataSource } from 'typeorm';

import { WishlistService, WishlistView } from '../../wishlist/application/wishlist.service';
import { WishlistSourceAdapter } from './wishlist-source.port';

/**
 * WishlistSourceAdapter.getItems (cust-wishlist-items-be, FR-CUST-013): flattens WISH's live
 * WishlistView into the admin Customer-360 shape. WishlistService is mocked — we assert the mapping,
 * not WISH's own price/availability resolution.
 */
describe('Customers — WishlistSourceAdapter.getItems', () => {
  const makeAdapter = (view: WishlistView) => {
    const wishlist = { getWishlist: jest.fn().mockResolvedValue(view) } as unknown as WishlistService;
    const dataSource = {} as unknown as DataSource;
    return { adapter: new WishlistSourceAdapter(dataSource, wishlist), wishlist };
  };

  const baseItem = (over: Partial<WishlistView['items'][number]> = {}): WishlistView['items'][number] => ({
    item_id: 'wi1',
    product: {
      id: 'c7', slug: 'predator', title: 'Adidas Predator Elite', name_bn: null, brand: 'Adidas',
      primary_image: 'https://cdn/listing.webp', hover_image: null, swatches: [],
      requires_variant: true, merch_label: null,
      effective_price: '12500.00', base_price: '14000.00', on_sale: true, currency: 'BDT',
    },
    preferred_variant: { id: 'v1', sku_code: 'PRED-BLK-42', options: { color: 'Black', size: '42' } },
    availability: 'in_stock',
    is_available: true,
    added_at: '2026-06-02T14:20:00.000Z',
    ...over,
  });

  it('flattens an item to the admin shape (price = effective, in_stock = is_available, options from preferred variant)', async () => {
    const { adapter, wishlist } = makeAdapter({ items: [baseItem()], total: 1, max_items: 100 });

    const items = await adapter.getItems('cust-1');

    expect(wishlist.getWishlist).toHaveBeenCalledWith('cust-1');
    expect(items).toEqual([
      {
        product_id: 'c7',
        product_title: 'Adidas Predator Elite',
        product_image: 'https://cdn/listing.webp',
        variant_options: { color: 'Black', size: '42' },
        price: '12500.00',
        in_stock: true,
        added_at: '2026-06-02T14:20:00.000Z',
      },
    ]);
  });

  it('maps variant_options to null when there is no preferred variant, and carries out-of-stock through', async () => {
    const item = baseItem({ preferred_variant: null, is_available: false, availability: 'out_of_stock' });
    const { adapter } = makeAdapter({ items: [item], total: 1, max_items: 100 });

    const [mapped] = await adapter.getItems('cust-1');

    expect(mapped.variant_options).toBeNull();
    expect(mapped.in_stock).toBe(false);
  });

  it('returns [] for a customer with no/empty wishlist', async () => {
    const { adapter } = makeAdapter({ items: [], total: 0, max_items: 100 });
    await expect(adapter.getItems('guest-x')).resolves.toEqual([]);
  });
});
