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
  let products: { findOne: jest.Mock; find: jest.Mock; update: jest.Mock };
  let images: { count: jest.Mock };
  let variantPublish: { countEnabledVariants: jest.Mock };
  let searchIndex: { upsert: jest.Mock; remove: jest.Mock };
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
    products = { findOne: jest.fn(), find: jest.fn(), update: jest.fn().mockResolvedValue(undefined) };
    images = { count: jest.fn().mockResolvedValue(1) };
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
        { provide: INVENTORY_QTY_PORT, useValue: { getQtyByProductIds: jest.fn() } },
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
});
