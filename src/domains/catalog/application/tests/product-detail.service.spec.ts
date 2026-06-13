import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';

import { ProductDetailService } from '../services/product-detail.service';
import { SizeGuideService } from '../services/size-guide.service';
import { INVENTORY_STATUS_PORT } from '../ports/inventory-status.port';
import { ProductStatus, ProductType } from '../../domain/enums/product-type.enum';
import { ProductOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product.orm-entity';
import { AttributeFamilyOrmEntity } from '../../infrastructure/persistence/typeorm/entities/attribute-family.orm-entity';
import { CategoryOrmEntity } from '../../infrastructure/persistence/typeorm/entities/category.orm-entity';
import { ProductImageOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-image.orm-entity';
import { ProductVideoOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-video.orm-entity';
import { ProductVariantOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-variant.orm-entity';
import { ProductVariantOptionOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-variant-option.orm-entity';
import { ProductConfigurableAttributeOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-configurable-attribute.orm-entity';
import { ProductAttributeValueOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-attribute-value.orm-entity';
import { ProductLinkOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-link.orm-entity';
import { AttributeOrmEntity } from '../../infrastructure/persistence/typeorm/entities/attribute.orm-entity';
import { AttributeOptionOrmEntity } from '../../infrastructure/persistence/typeorm/entities/attribute-option.orm-entity';

const baseProduct = (o: Partial<ProductOrmEntity> = {}): ProductOrmEntity =>
  ({
    id: 'p1',
    type: ProductType.CONFIGURABLE,
    familyId: 'fam-1',
    sku: 'PRED',
    name: 'Adidas Predator Elite',
    slug: 'adidas-predator-elite',
    brand: 'Adidas',
    shortDescription: 'short',
    description: 'long',
    basePrice: '14000.00',
    salePrice: null,
    saleStartsAt: null,
    saleEndsAt: null,
    status: ProductStatus.PUBLISHED,
    isFeatured: false,
    isNew: true,
    weight: null,
    primaryCategoryId: 'cat-1',
    primaryImageId: null,
    metaTitle: null,
    metaKeywords: null,
    metaDescription: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...o,
  }) as ProductOrmEntity;

describe('Catalog — ProductDetailService', () => {
  let service: ProductDetailService;
  let products: { findOne: jest.Mock; find: jest.Mock };
  let variants: { find: jest.Mock };
  let stockPort: { getStatusByVariantIds: jest.Mock };
  let sizeGuides: { resolveForCategory: jest.Mock };

  const emptyRepo = () => ({ find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) });

  beforeEach(async () => {
    products = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    variants = { find: jest.fn().mockResolvedValue([]) };
    stockPort = { getStatusByVariantIds: jest.fn().mockResolvedValue(new Map()) };
    sizeGuides = { resolveForCategory: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductDetailService,
        { provide: getRepositoryToken(ProductOrmEntity), useValue: products },
        { provide: getRepositoryToken(AttributeFamilyOrmEntity), useValue: { findOne: jest.fn().mockResolvedValue({ code: 'mens_footwear' }) } },
        { provide: getRepositoryToken(CategoryOrmEntity), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: getRepositoryToken(ProductImageOrmEntity), useValue: emptyRepo() },
        { provide: getRepositoryToken(ProductVideoOrmEntity), useValue: emptyRepo() },
        { provide: getRepositoryToken(ProductVariantOrmEntity), useValue: variants },
        { provide: getRepositoryToken(ProductVariantOptionOrmEntity), useValue: emptyRepo() },
        { provide: getRepositoryToken(ProductConfigurableAttributeOrmEntity), useValue: emptyRepo() },
        { provide: getRepositoryToken(ProductAttributeValueOrmEntity), useValue: emptyRepo() },
        { provide: getRepositoryToken(ProductLinkOrmEntity), useValue: emptyRepo() },
        { provide: getRepositoryToken(AttributeOrmEntity), useValue: emptyRepo() },
        { provide: getRepositoryToken(AttributeOptionOrmEntity), useValue: emptyRepo() },
        { provide: INVENTORY_STATUS_PORT, useValue: stockPort },
        { provide: SizeGuideService, useValue: sizeGuides },
      ],
    }).compile();
    service = module.get(ProductDetailService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should 404 for an unknown slug (FR-CAT-046)', async () => {
    products.findOne.mockResolvedValue(null);
    await expect(service.getBySlug('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should 404 for a draft product (FR-CAT-046)', async () => {
    products.findOne.mockResolvedValue(baseProduct({ status: ProductStatus.DRAFT }));
    await expect(service.getBySlug('adidas-predator-elite')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should 404 for a soft-deleted product (FR-CAT-046)', async () => {
    products.findOne.mockResolvedValue(baseProduct({ deletedAt: new Date() }));
    await expect(service.getBySlug('adidas-predator-elite')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should return base price + sale_active=false outside the sale window (FR-CAT-043)', async () => {
    products.findOne.mockResolvedValue(
      baseProduct({
        salePrice: '12500.00',
        saleStartsAt: new Date('2026-01-01T00:00:00Z'),
        saleEndsAt: new Date('2026-01-31T00:00:00Z'),
      }),
    );
    const result = await service.getBySlug('adidas-predator-elite', new Date('2026-06-06T00:00:00Z'));
    expect(result.sale_active).toBe(false);
    expect(result.base_price).toBe('14000.00');
    expect(result.effective_price).toBe('14000.00');
  });

  it('should apply the sale price + sale_active=true inside the sale window (FR-CAT-043)', async () => {
    products.findOne.mockResolvedValue(
      baseProduct({
        salePrice: '12500.00',
        saleStartsAt: new Date('2026-06-01T00:00:00Z'),
        saleEndsAt: new Date('2026-06-20T00:00:00Z'),
      }),
    );
    const result = await service.getBySlug('adidas-predator-elite', new Date('2026-06-06T00:00:00Z'));
    expect(result.sale_active).toBe(true);
    expect(result.effective_price).toBe('12500.00');
  });

  it('should still return a full payload when every variant is out_of_stock (FR-CAT-044)', async () => {
    products.findOne.mockResolvedValue(baseProduct());
    variants.find.mockResolvedValue([{ id: 'v1', skuCode: 'PRED-BLK-42', priceOverride: null, isEnabled: true }]);
    stockPort.getStatusByVariantIds.mockResolvedValue(new Map([['v1', { status: 'out_of_stock' }]]));
    const result = await service.getBySlug('adidas-predator-elite');
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0].stock_status).toBe('out_of_stock');
    expect(result.currency).toBe('BDT');
  });

  it('should return size_guide=null when no category chart applies (RW6)', async () => {
    products.findOne.mockResolvedValue(baseProduct());
    const result = await service.getBySlug('adidas-predator-elite');
    expect(result.size_guide).toBeNull();
    expect(sizeGuides.resolveForCategory).toHaveBeenCalledWith('cat-1');
  });

  it('should resolve the category size_guide onto the product detail (RW6)', async () => {
    products.findOne.mockResolvedValue(baseProduct());
    const chart = {
      measure_note: 'Measure heel-to-toe.',
      unit: 'cm',
      rows: [{ uk: '7', foot: '25.4' }],
    };
    sizeGuides.resolveForCategory.mockResolvedValue(chart);
    const result = await service.getBySlug('adidas-predator-elite');
    expect(result.size_guide).toEqual(chart);
  });
});
