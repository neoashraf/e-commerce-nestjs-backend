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
): ProductsService {
  const products = { findOne: jest.fn().mockResolvedValue(found) };
  const families = { findOne: jest.fn().mockResolvedValue({ code: 'boots-family' }) };
  const dataSource = {
    getRepository: (entity: unknown) =>
      entity === ProductCategoryOrmEntity
        ? { find: jest.fn().mockResolvedValue(categoryLinks) }
        : { find: jest.fn().mockResolvedValue([]) }, // attribute-value / attribute / option repos
  };
  return Reflect.construct(ProductsService, [
    products,
    families,
    {},
    {},
    {},
    dataSource,
    {},
    {},
    {},
    {},
    {},
    { upsert: jest.fn(), remove: jest.fn() }, // search-index port (unused by getAdminDetail)
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

  it('throws 404 PRODUCT_NOT_FOUND when the product is missing', async () => {
    const svc = makeService(null);
    await expect(svc.getAdminDetail('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
