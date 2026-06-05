import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  ATTRIBUTE_REPOSITORY,
  IAttributeRepository,
} from '../../domain/repositories/attribute.repository.interface';

/**
 * Deletes a user-defined attribute (FR-CAT-055/059). Blocks a seeded system attribute
 * (`409 SYSTEM_ATTRIBUTE`) and any attribute referenced by a product value/variant
 * (`409 ATTRIBUTE_IN_USE`); otherwise removes it (and its options via FK cascade) → `204`.
 */
@Injectable()
export class DeleteAttributeUseCase {
  constructor(
    @Inject(ATTRIBUTE_REPOSITORY) private readonly attributes: IAttributeRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const attribute = await this.attributes.findById(id);
    if (!attribute) {
      throw new NotFoundException({
        code: 'ATTRIBUTE_NOT_FOUND',
        message: `Attribute ${id} not found.`,
      });
    }

    if (!attribute.isDeletable) {
      throw new ConflictException({
        code: 'SYSTEM_ATTRIBUTE',
        message: 'A seeded system attribute cannot be deleted.',
      });
    }

    if (await this.attributes.isAttributeReferenced(id)) {
      throw new ConflictException({
        code: 'ATTRIBUTE_IN_USE',
        message: 'This attribute is assigned to products/variants; disable or reassign it instead.',
      });
    }

    await this.attributes.delete(id);
  }
}
