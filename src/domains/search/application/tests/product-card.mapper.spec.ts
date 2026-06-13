import { ProductSearchDocumentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-search-document.orm-entity';
import { toProductCard } from '../services/product-card.mapper';

function makeDoc(over: Partial<ProductSearchDocumentOrmEntity> = {}): ProductSearchDocumentOrmEntity {
  return {
    productId: 'p1',
    slug: 'adidas-predator-elite',
    title: 'Adidas Predator Elite',
    nameBn: null,
    brand: 'Adidas',
    categoryPath: null,
    searchText: '',
    primaryImage: '/uploads/p1.jpg',
    hoverImage: null,
    swatches: [],
    requiresVariant: false,
    merchLabel: null,
    effectivePrice: '12500.00',
    basePrice: '14000.00',
    onSale: true,
    availability: 'in_stock',
    bestSellingScore: 0,
    publishedAt: null,
    categoryIds: [],
    attributes: {},
    colors: [],
    sizes: [],
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
    ...over,
  } as ProductSearchDocumentOrmEntity;
}

describe('Search — toProductCard (RW6 card fields)', () => {
  it('maps the base card shape with money as 2-dp strings', () => {
    const card = toProductCard(makeDoc());
    expect(card).toMatchObject({
      id: 'p1',
      slug: 'adidas-predator-elite',
      title: 'Adidas Predator Elite',
      brand: 'Adidas',
      primary_image: '/uploads/p1.jpg',
      effective_price: '12500.00',
      base_price: '14000.00',
      on_sale: true,
      currency: 'BDT',
      availability: 'in_stock',
    });
  });

  it('returns null/[] fallbacks when the RW6 source fields are unset', () => {
    const card = toProductCard(makeDoc());
    expect(card.name_bn).toBeNull();
    expect(card.hover_image).toBeNull();
    expect(card.swatches).toEqual([]);
    expect(card.requires_variant).toBe(false);
    expect(card.merch_label).toBeNull();
  });

  it('passes populated RW6 fields straight through', () => {
    const card = toProductCard(
      makeDoc({
        nameBn: 'অ্যাডিডাস প্রিডেটর এলিট',
        hoverImage: '/uploads/p1-2.jpg',
        swatches: [{ image: '/uploads/p1-black.jpg', label: 'Black', color_hex: '#000000' }],
        requiresVariant: true,
        merchLabel: 'new',
      }),
    );
    expect(card.name_bn).toBe('অ্যাডিডাস প্রিডেটর এলিট');
    expect(card.hover_image).toBe('/uploads/p1-2.jpg');
    expect(card.swatches).toEqual([
      { image: '/uploads/p1-black.jpg', label: 'Black', color_hex: '#000000' },
    ]);
    expect(card.requires_variant).toBe(true);
    expect(card.merch_label).toBe('new');
  });

  it('tolerates a legacy/unindexed doc missing the RW6 columns (undefined → fallback)', () => {
    // A row written before the RW6 migration backfill: the new fields are absent.
    const legacy = makeDoc() as unknown as Record<string, unknown>;
    // Simulate absent columns.
    legacy.swatches = undefined;
    legacy.requiresVariant = undefined;
    legacy.merchLabel = undefined;
    legacy.hoverImage = undefined;
    legacy.nameBn = undefined;

    const card = toProductCard(legacy as unknown as ProductSearchDocumentOrmEntity);
    expect(card.swatches).toEqual([]);
    expect(card.requires_variant).toBe(false);
    expect(card.merch_label).toBeNull();
    expect(card.hover_image).toBeNull();
    expect(card.name_bn).toBeNull();
  });
});
