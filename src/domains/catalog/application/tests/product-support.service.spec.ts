import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { ProductSupportService } from '../services/product-support.service';
import { ProductOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product.orm-entity';
import { ATTRIBUTE_FAMILY_REPOSITORY } from '../../domain/repositories/attribute-family.repository.interface';
import { ATTRIBUTE_REPOSITORY } from '../../domain/repositories/attribute.repository.interface';

describe('Catalog — ProductSupportService', () => {
  let service: ProductSupportService;
  let slugCounts: number[];

  const makeQb = (count: number) => ({
    withDeleted: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(count),
  });

  beforeEach(async () => {
    slugCounts = [];
    let call = 0;
    const productsRepo = {
      createQueryBuilder: jest.fn(() => makeQb(slugCounts[call++] ?? 0)),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductSupportService,
        { provide: getRepositoryToken(ProductOrmEntity), useValue: productsRepo },
        { provide: ATTRIBUTE_FAMILY_REPOSITORY, useValue: { findById: jest.fn() } },
        { provide: ATTRIBUTE_REPOSITORY, useValue: { findByCode: jest.fn() } },
      ],
    }).compile();
    service = module.get(ProductSupportService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should slugify a name to a lowercase hyphenated url-key', () => {
    expect(service.slugify('Adidas Predator Elite')).toBe('adidas-predator-elite');
    expect(service.slugify("Nike's Mercurial!!")).toBe('nikes-mercurial');
  });

  it('should return the base slug when it is free', async () => {
    slugCounts = [0];
    expect(await service.generateUniqueSlug('Adidas Predator Elite')).toBe('adidas-predator-elite');
  });

  it('should append a numeric suffix on slug collision (FR-CAT-011, §12.6)', async () => {
    slugCounts = [1, 1, 0]; // base taken, -2 taken, -3 free
    expect(await service.generateUniqueSlug('Adidas Predator Elite')).toBe('adidas-predator-elite-3');
  });
});
