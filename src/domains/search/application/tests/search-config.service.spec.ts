import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';

import { SearchConfigService } from '../services/search-config.service';
import { RedirectTargetType } from '../../domain/search-enums';
import { CategoryOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/category.orm-entity';
import { ProductOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/product.orm-entity';
import { SearchRedirectOrmEntity } from '../../infrastructure/persistence/typeorm/entities/search-redirect.orm-entity';
import { SearchSynonymOrmEntity } from '../../infrastructure/persistence/typeorm/entities/search-synonym.orm-entity';

describe('Search — SearchConfigService', () => {
  let service: SearchConfigService;
  let synonyms: { find: jest.Mock; findOne: jest.Mock; save: jest.Mock; create: jest.Mock; delete: jest.Mock };
  let redirects: { find: jest.Mock; findOne: jest.Mock; save: jest.Mock; create: jest.Mock; delete: jest.Mock };
  let categories: { findOne: jest.Mock };
  let products: { findOne: jest.Mock };

  beforeEach(async () => {
    synonyms = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((r) => Promise.resolve(r)),
      create: jest.fn().mockImplementation((r) => r),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    redirects = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((r) => Promise.resolve(r)),
      create: jest.fn().mockImplementation((r) => r),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    categories = { findOne: jest.fn() };
    products = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchConfigService,
        { provide: getRepositoryToken(SearchSynonymOrmEntity), useValue: synonyms },
        { provide: getRepositoryToken(SearchRedirectOrmEntity), useValue: redirects },
        { provide: getRepositoryToken(CategoryOrmEntity), useValue: categories },
        { provide: getRepositoryToken(ProductOrmEntity), useValue: products },
      ],
    }).compile();
    service = module.get(SearchConfigService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should reject a synonym group with fewer than 2 terms (§11)', async () => {
    await expect(service.createSynonym({ terms: ['boots'] })).rejects.toThrow(BadRequestException);
  });

  it('should normalize + dedupe synonym terms and create a valid group', async () => {
    await service.createSynonym({ terms: ['Boots', 'boots', 'Cleats'] });
    expect(synonyms.save).toHaveBeenCalledWith(
      expect.objectContaining({ terms: ['boots', 'cleats'], isActive: true }),
    );
  });

  it('should reject a redirect whose pattern is already mapped by an active rule (§11)', async () => {
    redirects.find.mockResolvedValue([{ id: 'r1', queryPattern: 'predator', isActive: true }]);
    categories.findOne.mockResolvedValue({ slug: 'predator-collection' });
    await expect(
      service.createRedirect({
        query_pattern: 'Predator',
        target_type: RedirectTargetType.CATEGORY,
        target_ref: 'predator-collection',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject a redirect whose target_ref does not resolve (§11)', async () => {
    redirects.find.mockResolvedValue([]);
    categories.findOne.mockResolvedValue(null);
    await expect(
      service.createRedirect({
        query_pattern: 'predator',
        target_type: RedirectTargetType.CATEGORY,
        target_ref: 'missing-cat',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should create a valid redirect with a normalized pattern', async () => {
    redirects.find.mockResolvedValue([]);
    categories.findOne.mockResolvedValue({ slug: 'predator-collection' });
    await service.createRedirect({
      query_pattern: '  Predator  ',
      target_type: RedirectTargetType.CATEGORY,
      target_ref: 'predator-collection',
    });
    expect(redirects.save).toHaveBeenCalledWith(
      expect.objectContaining({ queryPattern: 'predator', targetRef: 'predator-collection' }),
    );
  });

  it('should match an active redirect by normalized query', async () => {
    redirects.findOne.mockResolvedValue({ queryPattern: 'predator', isActive: true });
    const match = await service.matchRedirect('predator');
    expect(match).not.toBeNull();
    expect(redirects.findOne).toHaveBeenCalledWith({
      where: { queryPattern: 'predator', isActive: true },
    });
  });
});
