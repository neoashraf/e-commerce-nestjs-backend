import { NotFoundException } from '@nestjs/common';

import { Attribute } from '../../domain/entities/attribute.entity';
import { IAttributeRepository } from '../../domain/repositories/attribute.repository.interface';
import { GetAttributeUseCase } from '../use-cases/get-attribute.use-case';

function make(found: Attribute | null) {
  const repo = { findById: jest.fn().mockResolvedValue(found) };
  return { uc: new GetAttributeUseCase(repo as unknown as IAttributeRepository), repo };
}

describe('Catalog — GetAttributeUseCase', () => {
  it('returns the attribute when found', async () => {
    const attr = { id: 'a1', code: 'gender' } as Attribute;
    const { uc, repo } = make(attr);
    await expect(uc.execute('a1')).resolves.toBe(attr);
    expect(repo.findById).toHaveBeenCalledWith('a1');
  });

  it('throws 404 ATTRIBUTE_NOT_FOUND when the attribute is missing', async () => {
    const { uc } = make(null);
    await expect(uc.execute('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
