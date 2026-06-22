import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ProductsService, CreateProductInput } from '../services/products.service';
import { ProductSupportService } from '../services/product-support.service';
import { ProductPublishValidator } from '../services/product-publish.validator';
import { AttributeAssignmentValidator } from '../services/attribute-assignment.validator';
import { INVENTORY_QTY_PORT } from '../ports/inventory-qty.port';
import { INVENTORY_ADMIN_PORT } from '../ports/inventory-admin.port';
import { PRODUCT_VARIANT_PUBLISH_PORT } from '../ports/product-variant-publish.port';
import { SEARCH_INDEX_PORT } from '../ports/search-index.port';
import { ProductOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product.orm-entity';
import { AttributeFamilyOrmEntity } from '../../infrastructure/persistence/typeorm/entities/attribute-family.orm-entity';
import { CategoryOrmEntity } from '../../infrastructure/persistence/typeorm/entities/category.orm-entity';
import { ProductImageOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-image.orm-entity';
import { ProductVideoOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-video.orm-entity';
import { ProductLinkOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-link.orm-entity';
import { ProductStatus, ProductType } from '../../domain/enums/product-type.enum';

const buildCreate = (o: Partial<CreateProductInput> = {}): CreateProductInput => ({
  type: ProductType.SIMPLE,
  familyId: 'fam-1',
  sku: 'PRED-ELITE',
  name: 'Adidas Predator Elite',
  primaryCategoryId: 'cat-1',
  basePrice: '14000.00',
  ...o,
});

describe('Catalog — ProductsService', () => {
  let service: ProductsService;
  let support: { skuExists: jest.Mock; generateUniqueSlug: jest.Mock; getFamilyAttributes: jest.Mock };
  let families: { findOne: jest.Mock };
  let categories: { findOne: jest.Mock; find: jest.Mock };
  let products: { findOne: jest.Mock; find: jest.Mock; update: jest.Mock; createQueryBuilder: jest.Mock };
  let images: { count: jest.Mock };
  let variantPublish: { countEnabledVariants: jest.Mock };
  let searchIndex: { upsert: jest.Mock; remove: jest.Mock };
  let inventoryStock: { getStockByProductIds: jest.Mock };
  let presentAttributeValues: Array<{ attributeId: string }>;
  let dataSource: { transaction: jest.Mock; getRepository: jest.Mock };

  beforeEach(async () => {
    support = {
      skuExists: jest.fn().mockResolvedValue(false),
      generateUniqueSlug: jest.fn().mockResolvedValue('adidas-predator-elite'),
      getFamilyAttributes: jest.fn().mockResolvedValue(new Map()),
    };
    families = { findOne: jest.fn().mockResolvedValue({ id: 'fam-1' }) };
    categories = {
      findOne: jest.fn().mockResolvedValue({ id: 'cat-1' }),
      find: jest.fn().mockResolvedValue([]),
    };
    products = {
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(),
    };
    images = { count: jest.fn().mockResolvedValue(1) };
    inventoryStock = { getStockByProductIds: jest.fn().mockResolvedValue(new Map()) };
    variantPublish = { countEnabledVariants: jest.fn().mockResolvedValue(1) };
    searchIndex = { upsert: jest.fn().mockResolvedValue(undefined), remove: jest.fn().mockResolvedValue(undefined) };
    presentAttributeValues = [];
    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb) =>
        cb({
          getRepository: () => ({
            save: jest.fn().mockImplementation((e) => Promise.resolve({ id: 'new-product', ...e })),
            create: jest.fn().mockImplementation((e) => e),
            update: jest.fn(),
            delete: jest.fn(),
            insert: jest.fn(),
          }),
        }),
      ),
      // Non-transactional reads (e.g. publish-trinity EAV lookup) read the present attribute values.
      getRepository: jest.fn(() => ({
        find: jest.fn().mockImplementation(() => Promise.resolve(presentAttributeValues)),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(ProductOrmEntity), useValue: products },
        { provide: getRepositoryToken(AttributeFamilyOrmEntity), useValue: families },
        { provide: getRepositoryToken(CategoryOrmEntity), useValue: categories },
        { provide: getRepositoryToken(ProductImageOrmEntity), useValue: images },
        { provide: getRepositoryToken(ProductVideoOrmEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(ProductLinkOrmEntity), useValue: {} },
        { provide: DataSource, useValue: dataSource },
        { provide: ProductSupportService, useValue: support },
        { provide: AttributeAssignmentValidator, useValue: { assertValid: jest.fn() } },
        { provide: ProductPublishValidator, useValue: new ProductPublishValidator() },
        { provide: INVENTORY_QTY_PORT, useValue: inventoryStock },
        { provide: PRODUCT_VARIANT_PUBLISH_PORT, useValue: variantPublish },
        { provide: SEARCH_INDEX_PORT, useValue: searchIndex },
        {
          provide: INVENTORY_ADMIN_PORT,
          useValue: {
            ensureRecordForVariant: jest.fn().mockResolvedValue(undefined),
            getLevelsByVariantIds: jest.fn().mockResolvedValue(new Map()),
          },
        },
      ],
    }).compile();
    service = module.get(ProductsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a draft product when SKU/family/category are valid', async () => {
    const result = await service.create(buildCreate());
    expect(result.status).toBe('draft');
    expect(result.slug).toBe('adidas-predator-elite');
    expect(dataSource.transaction).toHaveBeenCalled();
  });

  it('should PUBLISH when only a required SYSTEM attribute is absent from EAV (stored on columns)', async () => {
    // System attributes (isUserDefined=false) live on product columns, never in product_attribute_values,
    // so requiring them in the EAV publish-check wrongly blocked every product. After the fix they're skipped.
    products.findOne.mockResolvedValue({ id: 'p1', type: ProductType.SIMPLE, primaryImageId: 'img1' });
    support.getFamilyAttributes.mockResolvedValue(
      new Map([['sku', { id: 'a-sku', code: 'sku', isRequired: true, isUserDefined: false }]]),
    );
    presentAttributeValues = []; // nothing in the EAV table

    const result = await service.setStatus('p1', ProductStatus.PUBLISHED);
    expect(result.status).toBe(ProductStatus.PUBLISHED);
    // The storefront index is refreshed so the published product appears in listings immediately.
    expect(searchIndex.upsert).toHaveBeenCalledWith('p1');
  });

  it('should BLOCK publish when a required USER-DEFINED attribute is missing', async () => {
    products.findOne.mockResolvedValue({ id: 'p1', type: ProductType.SIMPLE, primaryImageId: 'img1' });
    support.getFamilyAttributes.mockResolvedValue(
      new Map([['gender', { id: 'a-gender', code: 'gender', isRequired: true, isUserDefined: true }]]),
    );
    presentAttributeValues = []; // user-defined required value not provided

    await expect(service.setStatus('p1', ProductStatus.PUBLISHED)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('should reject a duplicate SKU with 409 SKU_CONFLICT', async () => {
    support.skuExists.mockResolvedValue(true);
    await expect(service.create(buildCreate())).rejects.toBeInstanceOf(ConflictException);
  });

  it('should reject sale_price >= base_price (FR-CAT-012)', async () => {
    await expect(
      service.create(
        buildCreate({
          salePrice: '14000.00',
          saleStartsAt: '2026-06-05T00:00:00Z',
          saleEndsAt: '2026-06-20T00:00:00Z',
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should reject a sale_price without both sale dates (FR-CAT-012)', async () => {
    await expect(service.create(buildCreate({ salePrice: '12000.00' }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('should exclude self from product links (FR-CAT-019)', async () => {
    products.findOne.mockResolvedValue({ id: 'p1' });
    products.find.mockResolvedValue([{ id: 'p2' }]);
    const result = await service.setLinks('p1', ['p1', 'p2'], [], []);
    expect(result.related).toBe(1); // self 'p1' dropped, only 'p2' kept
  });

  it('should reject unknown link targets (FR-CAT-019)', async () => {
    products.findOne.mockResolvedValue({ id: 'p1' });
    products.find.mockResolvedValue([]); // none of the targets exist
    await expect(service.setLinks('p1', ['p9'], [], [])).rejects.toBeInstanceOf(BadRequestException);
  });

  // --- list: sale_active (BR-CAT-4) + live qty_status (BR-CAT-5) -------------

  /** Chainable query-builder stub returning the given raw rows + total. */
  const makeQb = (rawRows: unknown[], total: number) => {
    const qb: Record<string, jest.Mock> = {};
    for (const m of ['leftJoin', 'select', 'addSelect', 'orderBy', 'andWhere', 'offset', 'limit']) {
      qb[m] = jest.fn().mockReturnValue(qb);
    }
    qb.getCount = jest.fn().mockResolvedValue(total);
    qb.getRawMany = jest.fn().mockResolvedValue(rawRows);
    return qb;
  };

  const baseRow = {
    id: 'p1', name: 'Boot', sku: 'SKU1', type: 'simple', family: 'f', primary_image: null,
    base_price: '14000.00', status: 'published', primary_category: 'Boots',
  };
  const NOW = new Date('2026-06-10T00:00:00.000Z');

  it('computes sale_active only inside the sale window + joins live qty_status (BR-CAT-4/5)', async () => {
    const rows = [
      { ...baseRow, id: 'p1', sale_price: '12500.00', sale_starts_at: '2026-06-05T00:00:00Z', sale_ends_at: '2026-06-20T00:00:00Z' },
      { ...baseRow, id: 'p2', sale_price: '9000.00', sale_starts_at: '2026-06-01T00:00:00Z', sale_ends_at: '2026-06-05T00:00:00Z' }, // expired
      { ...baseRow, id: 'p3', sale_price: null, sale_starts_at: null, sale_ends_at: null },
    ];
    products.createQueryBuilder.mockReturnValue(makeQb(rows, 3));
    inventoryStock.getStockByProductIds.mockResolvedValue(
      new Map([['p1', { qty: 12, qty_status: 'in_stock' }]]), // p2/p3 absent → null
    );

    const page = await service.list({ page: 1, limit: 20 }, NOW);

    expect(page.items[0]).toMatchObject({ id: 'p1', sale_active: true, qty: 12, qty_status: 'in_stock' });
    expect(page.items[1]).toMatchObject({ id: 'p2', sale_active: false, qty: null, qty_status: null });
    expect(page.items[2]).toMatchObject({ id: 'p3', sale_price: null, sale_active: false });
    expect(page.meta.total).toBe(3);
  });

  it('exportRows returns the full filtered set (no pagination) with the same enrichment', async () => {
    const qb = makeQb([{ ...baseRow, sale_price: null, sale_starts_at: null, sale_ends_at: null }], 1);
    products.createQueryBuilder.mockReturnValue(qb);
    inventoryStock.getStockByProductIds.mockResolvedValue(new Map());

    const rows = await service.exportRows({ status: undefined }, NOW);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sku: 'SKU1', qty: null, qty_status: null });
    expect(qb.offset).not.toHaveBeenCalled(); // export ignores pagination
    expect(qb.limit).not.toHaveBeenCalled();
  });

  // --- bulk-status (FR-CAT-015/016) -----------------------------------------

  it('bulk-publishes valid ids and reports NOT_PUBLISHABLE per-item without aborting the batch', async () => {
    // p-ok publishes cleanly; p-bad has no primary image → NOT_PUBLISHABLE; p-missing doesn't exist.
    products.findOne.mockImplementation((opts: { where: { id: string } }) => {
      const id = opts.where.id;
      if (id === 'p-ok') return Promise.resolve({ id, type: ProductType.SIMPLE, primaryImageId: 'img1', familyId: 'fam' });
      if (id === 'p-bad') return Promise.resolve({ id, type: ProductType.SIMPLE, primaryImageId: null, familyId: 'fam' });
      return Promise.resolve(null);
    });
    support.getFamilyAttributes.mockResolvedValue(new Map());

    const res = await service.bulkStatus(['p-ok', 'p-bad', 'p-missing'], ProductStatus.PUBLISHED);

    expect(res).toMatchObject({ processed: 3, succeeded: 1, failed: 2 });
    expect(res.results.find((r) => r.id === 'p-ok')).toMatchObject({ ok: true, status: 'published' });
    expect(res.results.find((r) => r.id === 'p-bad')).toMatchObject({ ok: false, code: 'NOT_PUBLISHABLE' });
    expect(res.results.find((r) => r.id === 'p-missing')).toMatchObject({ ok: false, code: 'PRODUCT_NOT_FOUND' });
    expect(products.update).toHaveBeenCalledWith({ id: 'p-ok' }, { status: ProductStatus.PUBLISHED });
    expect(products.update).not.toHaveBeenCalledWith({ id: 'p-bad' }, expect.anything());
  });

  it('bulk-archives without running the publish trinity', async () => {
    products.findOne.mockResolvedValue({ id: 'p1', type: ProductType.SIMPLE, primaryImageId: null, familyId: 'fam' });
    const res = await service.bulkStatus(['p1'], ProductStatus.ARCHIVED);
    expect(res).toMatchObject({ processed: 1, succeeded: 1, failed: 0 });
    expect(products.update).toHaveBeenCalledWith({ id: 'p1' }, { status: ProductStatus.ARCHIVED });
    expect(searchIndex.upsert).toHaveBeenCalledWith('p1');
  });
});
