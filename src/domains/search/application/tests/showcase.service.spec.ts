import { ShowcaseService } from '../services/showcase.service';

function makeDoc(id: string, over: Record<string, unknown> = {}) {
  return {
    productId: id,
    slug: `slug-${id}`,
    title: `Product ${id}`,
    nameBn: null,
    brand: 'Adidas',
    primaryImage: `/uploads/products/${id}.jpg`,
    hoverImage: null,
    swatches: [],
    requiresVariant: false,
    merchLabel: null,
    effectivePrice: '100.00',
    basePrice: '120.00',
    onSale: true,
    availability: 'in_stock',
    ...over,
  };
}

describe('Search — ShowcaseService.bestSelling', () => {
  it('ranks by units sold (query order) and skips unpublished ids (no doc)', async () => {
    // order_items aggregate returns ids in sold-desc order; b3 has no published doc.
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        { product_id: 'b1' },
        { product_id: 'b3' },
        { product_id: 'b2' },
      ]),
    };
    // Repo returns docs in arbitrary order and omits the unpublished b3.
    const docs = {
      find: jest.fn().mockResolvedValue([makeDoc('b2'), makeDoc('b1')]),
    };
    const svc = Reflect.construct(ShowcaseService, [docs, dataSource]) as ShowcaseService;

    const result = await svc.bestSelling();

    // b3 dropped (unpublished); order follows the sold-desc query order: b1 then b2.
    expect(result.map((c) => c.id)).toEqual(['b1', 'b2']);
    expect(result[0]).toMatchObject({
      id: 'b1',
      slug: 'slug-b1',
      currency: 'BDT',
      effective_price: '100.00',
      availability: 'in_stock',
    });
  });

  it('returns empty without hitting the doc repo when there are no sales', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([]) };
    const docs = { find: jest.fn() };
    const svc = Reflect.construct(ShowcaseService, [docs, dataSource]) as ShowcaseService;

    expect(await svc.bestSelling()).toEqual([]);
    expect(docs.find).not.toHaveBeenCalled();
  });
});

describe('Search — ShowcaseService.featured', () => {
  it('paginates and maps rows to product cards with meta', async () => {
    const rawRow = {
      product_id: 'f1',
      slug: 'slug-f1',
      title: 'Featured 1',
      name_bn: null,
      brand: 'Nike',
      primary_image: '/uploads/products/f1.jpg',
      hover_image: null,
      swatches: [],
      requires_variant: false,
      merch_label: null,
      effective_price: '9500.00',
      base_price: '9500.00',
      on_sale: false,
      availability: 'in_stock',
    };
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([rawRow]) // page rows
        .mockResolvedValueOnce([{ count: 7 }]), // total
    };
    const svc = Reflect.construct(ShowcaseService, [{}, dataSource]) as ShowcaseService;

    const result = await svc.featured(2, 3);

    expect(result.meta).toEqual({ page: 2, limit: 3, total: 7 });
    expect(result.items).toEqual([
      {
        id: 'f1',
        slug: 'slug-f1',
        title: 'Featured 1',
        name_bn: null,
        brand: 'Nike',
        primary_image: '/uploads/products/f1.jpg',
        hover_image: null,
        swatches: [],
        requires_variant: false,
        merch_label: null,
        effective_price: '9500.00',
        base_price: '9500.00',
        on_sale: false,
        currency: 'BDT',
        availability: 'in_stock',
      },
    ]);
    // OFFSET = (page-1)*limit = 3 passed to the page query.
    expect(dataSource.query.mock.calls[0][1]).toEqual([3, 3]);
  });

  it('maps the RW6 card fields (hover image, swatches, name_bn, requires_variant, merch_label) through', async () => {
    const rawRow = {
      product_id: 'f2',
      slug: 'slug-f2',
      title: 'Featured 2',
      name_bn: 'ফিচার্ড দুই',
      brand: 'Adidas',
      primary_image: '/uploads/products/f2.jpg',
      hover_image: '/uploads/products/f2-2.jpg',
      swatches: [{ image: '/uploads/products/f2-black.jpg', label: 'Black', color_hex: '#000000' }],
      requires_variant: true,
      merch_label: 'new',
      effective_price: '4290.00',
      base_price: '5990.00',
      on_sale: true,
      availability: 'in_stock',
    };
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([rawRow])
        .mockResolvedValueOnce([{ count: 1 }]),
    };
    const svc = Reflect.construct(ShowcaseService, [{}, dataSource]) as ShowcaseService;

    const result = await svc.featured(1, 20);

    expect(result.items[0]).toMatchObject({
      name_bn: 'ফিচার্ড দুই',
      hover_image: '/uploads/products/f2-2.jpg',
      swatches: [{ image: '/uploads/products/f2-black.jpg', label: 'Black', color_hex: '#000000' }],
      requires_variant: true,
      merch_label: 'new',
    });
  });
});
