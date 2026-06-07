import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';

import { FacetResolverService } from '../services/facet-resolver.service';
import { FacetSource, FacetType } from '../../domain/search-enums';
import { FacetDefinitionOrmEntity } from '../../infrastructure/persistence/typeorm/entities/facet-definition.orm-entity';
import { CategoryFilterableAttributeOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/category-filterable-attribute.orm-entity';
import { AttributeOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/attribute.orm-entity';

describe('Search — FacetResolverService', () => {
  let service: FacetResolverService;
  let facets: { find: jest.Mock; findOne: jest.Mock; save: jest.Mock; create: jest.Mock; delete: jest.Mock };
  let categoryFilterables: { find: jest.Mock };
  let attributes: { find: jest.Mock };

  beforeEach(async () => {
    facets = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((r) => Promise.resolve({ id: 'fct_1', ...r })),
      create: jest.fn().mockImplementation((r) => r),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    categoryFilterables = { find: jest.fn().mockResolvedValue([]) };
    attributes = { find: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FacetResolverService,
        { provide: getRepositoryToken(FacetDefinitionOrmEntity), useValue: facets },
        { provide: getRepositoryToken(CategoryFilterableAttributeOrmEntity), useValue: categoryFilterables },
        { provide: getRepositoryToken(AttributeOrmEntity), useValue: attributes },
      ],
    }).compile();
    service = module.get(FacetResolverService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should reject a duplicate facet key (§11, AC7)', async () => {
    facets.findOne.mockResolvedValue({ id: 'existing', key: 'surface' });
    await expect(
      service.create({ key: 'surface', label: 'Surface', type: FacetType.TERM, source: FacetSource.BRAND }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject source=attribute without source_attribute_key (§11, AC7)', async () => {
    facets.findOne.mockResolvedValue(null);
    await expect(
      service.create({ key: 'gender', label: 'Gender', type: FacetType.TERM, source: FacetSource.ATTRIBUTE }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should create a valid attribute facet', async () => {
    facets.findOne.mockResolvedValue(null);
    const created = await service.create({
      key: 'gender',
      label: 'Gender',
      type: FacetType.TERM,
      source: FacetSource.ATTRIBUTE,
      source_attribute_key: 'gender',
    });
    expect(created.key).toBe('gender');
  });

  it('should apply all active facets for a category with no filterable selection (graceful default)', async () => {
    facets.find.mockResolvedValue([
      { key: 'brand', label: 'Brand', type: 'term', source: 'brand', sourceAttributeKey: null, isMultiSelect: true, hideZeroCounts: true, displayOrder: 1, isActive: true },
    ]);
    categoryFilterables.find.mockResolvedValue([]);
    const resolved = await service.resolveForCategory('c1');
    expect(resolved.map((f) => f.key)).toEqual(['brand']);
  });

  it('should intersect attribute facets with the category filterable selection (+always-on)', async () => {
    facets.find.mockResolvedValue([
      { key: 'brand', label: 'Brand', type: 'term', source: 'brand', sourceAttributeKey: null, isMultiSelect: true, hideZeroCounts: true, displayOrder: 1, isActive: true },
      { key: 'gender', label: 'Gender', type: 'term', source: 'attribute', sourceAttributeKey: 'gender', isMultiSelect: true, hideZeroCounts: true, displayOrder: 2, isActive: true },
      { key: 'sport', label: 'Sport', type: 'term', source: 'attribute', sourceAttributeKey: 'sport', isMultiSelect: true, hideZeroCounts: true, displayOrder: 3, isActive: true },
    ]);
    categoryFilterables.find.mockResolvedValue([{ attributeId: 'a-gender' }]);
    attributes.find.mockResolvedValue([{ id: 'a-gender', code: 'gender' }]);

    const resolved = await service.resolveForCategory('c1');

    // brand always-on + gender (in selection); sport excluded (not selected).
    expect(resolved.map((f) => f.key).sort()).toEqual(['brand', 'gender']);
  });
});
