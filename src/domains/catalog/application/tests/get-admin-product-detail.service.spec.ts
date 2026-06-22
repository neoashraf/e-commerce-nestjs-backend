import { NotFoundException } from '@nestjs/common';

import { ProductCategoryOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-category.orm-entity';
import { ProductOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product.orm-entity';
import { ProductsService } from '../services/products.service';

const product = {
  id: 'p1',
  type: 'configurable',
  familyId: 'fam1',
  sku: 'SKU1',
  name: 'Boot',
  slug: 'boot',
  status: 'draft',
  brand: 'Adidas',
  shortDescription: null,
  description: null,
  basePrice: '14000.00',
  salePrice: null,
  saleStartsAt: null,
  saleEndsAt: null,
  isFeatured: false,
  isNew: true,
  weight: null,
  primaryCategoryId: 'cat1',
  primaryImageId: null,
  metaTitle: null,
  metaKeywords: null,
  metaDescription: null,
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
  updatedAt: new Date('2026-06-02T00:00:00.000Z'),
} as ProductOrmEntity;

function makeService(
  found: ProductOrmEntity | null,
  categoryLinks: Array<{ categoryId: string }> = [],
  imageRows: Array<Record<string, unknown>> = [],
  videoRows: Array<Record<string, unknown>> = [],
): ProductsService {
  const products = { findOne: jest.fn().mockResolvedValue(found) };
  const families = { findOne: jest.fn().mockResolvedValue({ code: 'boots-family' }) };
  const dataSource = {
    getRepository: (entity: unknown) =>
      entity === ProductCategoryOrmEntity
        ? { find: jest.fn().mockResolvedValue(categoryLinks) }
        : { find: jest.fn().mockResolvedValue([]) }, // attribute-value / attribute / option / variant repos
  };
  const images = { find: jest.fn().mockResolvedValue(imageRows) }; // product_images repo (gallery)
  const videos = { find: jest.fn().mockResolvedValue(videoRows) }; // product_videos repo
  return Reflect.construct(ProductsService, [
    products,
    families,
    {}, // categories
    images, // images
    videos, // videos
    {}, // links
    dataSource,
    {},
    {},
    {},
    {},
    {},
    { upsert: jest.fn(), remove: jest.fn() }, // search-index port (unused by getAdminDetail)
    // inventory-admin port (variant stock levels) — no variants in this fixture, so unused
    { getLevelsByVariantIds: jest.fn().mockResolvedValue(new Map()), ensureRecordForVariant: jest.fn() },
  ]) as ProductsService;
}

describe('Catalog — ProductsService.getAdminDetail', () => {
  it('maps the product to the editor detail with updated_at + category_ids', async () => {
    const svc = makeService(product, [{ categoryId: 'cat2' }, { categoryId: 'cat3' }]);
    const d = await svc.getAdminDetail('p1');
    expect(d).toMatchObject({
      id: 'p1',
      family_id: 'fam1',
      family_code: 'boots-family',
      sku: 'SKU1',
      primary_category_id: 'cat1',
      category_ids: ['cat2', 'cat3'],
      base_price: '14000.00',
      updated_at: '2026-06-02T00:00:00.000Z',
      attributes: {},
    });
  });

  it('returns color_option_id on each image and the ordered videos block (FR-CAT-032/034)', async () => {
    const svc = makeService(
      product,
      [],
      [
        { id: 'i1', url: 'u1', renditions: null, altText: 'a1', colorOptionId: 'o-black', isPrimary: true, displayOrder: 0 },
        { id: 'i2', url: 'u2', renditions: null, altText: 'a2', colorOptionId: null, isPrimary: false, displayOrder: 1 },
      ],
      [{ id: 'vd1', source: 'url', url: 'https://v', displayOrder: 0 }],
    );
    const d = await svc.getAdminDetail('p1');
    expect(d.images[0]).toMatchObject({ id: 'i1', color_option_id: 'o-black', is_primary: true });
    expect(d.images[1]).toMatchObject({ id: 'i2', color_option_id: null });
    expect(d.videos).toEqual([{ id: 'vd1', source: 'url', url: 'https://v', display_order: 0 }]);
  });

  it('throws 404 PRODUCT_NOT_FOUND when the product is missing', async () => {
    const svc = makeService(null);
    await expect(svc.getAdminDetail('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
