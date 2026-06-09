import { NotFoundException } from '@nestjs/common';

import { Category } from '../../domain/entities/category.entity';
import { ICategoryRepository } from '../../domain/repositories/category.repository.interface';
import { GetCategoryUseCase } from '../use-cases/get-category.use-case';

function make(found: Category | null) {
  const repo = { findById: jest.fn().mockResolvedValue(found) };
  return { uc: new GetCategoryUseCase(repo as unknown as ICategoryRepository), repo };
}

describe('Catalog — GetCategoryUseCase', () => {
  it('returns the category when found', async () => {
    const cat = { id: 'c1', name: 'Football Boots' } as Category;
    const { uc, repo } = make(cat);
    await expect(uc.execute('c1')).resolves.toBe(cat);
    expect(repo.findById).toHaveBeenCalledWith('c1');
  });

  it('throws 404 CATEGORY_NOT_FOUND when the category is missing', async () => {
    const { uc } = make(null);
    await expect(uc.execute('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
