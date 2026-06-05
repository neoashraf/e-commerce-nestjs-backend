import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { VariantsService } from '../services/variants.service';
import { ATTRIBUTE_REPOSITORY } from '../../domain/repositories/attribute.repository.interface';
import { AttributeType } from '../../domain/enums/attribute-type.enum';
import { ProductType } from '../../domain/enums/product-type.enum';
import { ProductOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product.orm-entity';
import { ProductVariantOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-variant.orm-entity';
import { ProductVariantOptionOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-variant-option.orm-entity';
import { ProductConfigurableAttributeOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-configurable-attribute.orm-entity';

const colorAttr = {
  id: 'attr-color',
  code: 'color',
  type: AttributeType.SELECT,
  isConfigurable: true,
  options: [
    { id: 'o-black', value: 'Black' },
    { id: 'o-white', value: 'White' },
  ],
};
const sizeAttr = {
  id: 'attr-size',
  code: 'size',
  type: AttributeType.SELECT,
  isConfigurable: true,
  options: [
    { id: 'o-42', value: '42' },
    { id: 'o-43', value: '43' },
  ],
};

describe('Catalog — VariantsService', () => {
  let service: VariantsService;
  let products: { findOne: jest.Mock };
  let variants: {
    findOne: jest.Mock;
    find: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let variantOptions: { find: jest.Mock };
  let attributes: { findByCode: jest.Mock };
  let savedVariants: { id: string; skuCode: string }[];

  const makeManager = () => ({
    getRepository: (entity: unknown) => {
      if (entity === ProductVariantOrmEntity) {
        return {
          save: jest.fn().mockImplementation((e) => {
            const row = { id: `v${savedVariants.length + 1}`, ...e };
            savedVariants.push(row);
            return Promise.resolve(row);
          }),
          create: jest.fn().mockImplementation((e) => e),
          createQueryBuilder: jest.fn(() => ({
            withDeleted: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getCount: jest.fn().mockResolvedValue(0),
          })),
        };
      }
      if (entity === ProductOrmEntity) {
        return {
          createQueryBuilder: jest.fn(() => ({
            withDeleted: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getCount: jest.fn().mockResolvedValue(0),
          })),
        };
      }
      // option / configurable-attribute repos
      return { insert: jest.fn(), delete: jest.fn() };
    },
  });

  beforeEach(async () => {
    savedVariants = [];
    products = {
      findOne: jest.fn().mockResolvedValue({ id: 'p1', sku: 'PRED-ELITE', type: ProductType.CONFIGURABLE }),
    };
    variants = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        withDeleted: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      })),
    };
    variantOptions = { find: jest.fn().mockResolvedValue([]) };
    attributes = {
      findByCode: jest.fn().mockImplementation((code: string) =>
        code === 'color' ? colorAttr : code === 'size' ? sizeAttr : null,
      ),
    };
    const dataSource = { transaction: jest.fn().mockImplementation((cb) => cb(makeManager())), query: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VariantsService,
        { provide: getRepositoryToken(ProductOrmEntity), useValue: products },
        { provide: getRepositoryToken(ProductVariantOrmEntity), useValue: variants },
        { provide: getRepositoryToken(ProductVariantOptionOrmEntity), useValue: variantOptions },
        { provide: getRepositoryToken(ProductConfigurableAttributeOrmEntity), useValue: { find: jest.fn() } },
        { provide: ATTRIBUTE_REPOSITORY, useValue: attributes },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(VariantsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should generate the Cartesian product (2×2 = 4 variants) with unique derived SKUs', async () => {
    const result = await service.generate('p1', [
      { code: 'color', optionIds: ['o-black', 'o-white'] },
      { code: 'size', optionIds: ['o-42', 'o-43'] },
    ]);
    expect(result.variants_created).toBe(4);
    const skus = result.variants.map((v) => v.sku_code);
    expect(new Set(skus).size).toBe(4);
    expect(skus).toContain('PRED-ELITE-BLACK-42');
    expect(result.variants[0].options).toEqual(expect.objectContaining({ color: expect.any(String) }));
  });

  it('should reject zero configurable attributes (FR-CAT-027)', async () => {
    await expect(service.generate('p1', [])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should reject a non-configurable / non-select attribute (BR-CAT-11)', async () => {
    attributes.findByCode.mockResolvedValue({
      id: 'attr-mat',
      code: 'material',
      type: AttributeType.TEXT,
      isConfigurable: false,
      options: [],
    });
    await expect(
      service.generate('p1', [{ code: 'material', optionIds: ['x'] }]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should reject generating variants for a non-configurable product', async () => {
    products.findOne.mockResolvedValue({ id: 'p1', sku: 'X', type: ProductType.SIMPLE });
    await expect(
      service.generate('p1', [{ code: 'color', optionIds: ['o-black'] }]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should append only new combinations on re-generate (FR-CAT-021)', async () => {
    // Existing: a single black/42 variant already present.
    variants.find.mockResolvedValue([{ id: 'existing' }]);
    variantOptions.find.mockResolvedValue([
      { variantId: 'existing', attributeId: 'attr-color', optionId: 'o-black' },
      { variantId: 'existing', attributeId: 'attr-size', optionId: 'o-42' },
    ]);
    const result = await service.generate('p1', [
      { code: 'color', optionIds: ['o-black', 'o-white'] },
      { code: 'size', optionIds: ['o-42', 'o-43'] },
    ]);
    // 4 combos minus the 1 existing = 3 newly created.
    expect(result.variants_created).toBe(3);
  });

  it('should reject a sku_code override that is already in use (FR-CAT-022)', async () => {
    variants.findOne.mockResolvedValue({ id: 'v1', skuCode: 'OLD' });
    variants.createQueryBuilder.mockReturnValue({
      withDeleted: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(1),
    });
    await expect(service.update({ id: 'v1', skuCode: 'TAKEN' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('should count enabled variants for the publish gate (FR-CAT-025)', async () => {
    variants.count.mockResolvedValue(3);
    expect(await service.countEnabledVariants('p1')).toBe(3);
    expect(variants.count).toHaveBeenCalledWith({ where: { productId: 'p1', isEnabled: true } });
  });
});
