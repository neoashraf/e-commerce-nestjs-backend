import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  ATTRIBUTE_FAMILY_REPOSITORY,
  IAttributeFamilyRepository,
} from '../../domain/repositories/attribute-family.repository.interface';

/**
 * Deletes a non-default, unreferenced family (FR-CAT-063/064). Returns `409 DEFAULT_FAMILY`
 * for the seeded Default family and `409 FAMILY_IN_USE` when any product references it.
 */
@Injectable()
export class DeleteAttributeFamilyUseCase {
  constructor(
    @Inject(ATTRIBUTE_FAMILY_REPOSITORY)
    private readonly families: IAttributeFamilyRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const family = await this.families.findById(id);
    if (!family) {
      throw new NotFoundException({
        code: 'FAMILY_NOT_FOUND',
        message: `Attribute family ${id} not found.`,
      });
    }

    if (family.isDefault) {
      throw new ConflictException({
        code: 'DEFAULT_FAMILY',
        message: 'The Default family cannot be deleted.',
      });
    }

    if (await this.families.isReferencedByProduct(id)) {
      throw new ConflictException({
        code: 'FAMILY_IN_USE',
        message: 'This family is referenced by one or more products; re-assign them first.',
      });
    }

    await this.families.delete(id);
  }
}
