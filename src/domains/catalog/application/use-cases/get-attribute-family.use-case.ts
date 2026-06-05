import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { AttributeFamily } from '../../domain/entities/attribute-family.entity';
import {
  ATTRIBUTE_FAMILY_REPOSITORY,
  IAttributeFamilyRepository,
} from '../../domain/repositories/attribute-family.repository.interface';

/** Returns a full family with ordered groups + attributes for editor prefill (FR-CAT-061). */
@Injectable()
export class GetAttributeFamilyUseCase {
  constructor(
    @Inject(ATTRIBUTE_FAMILY_REPOSITORY)
    private readonly families: IAttributeFamilyRepository,
  ) {}

  async execute(id: string): Promise<AttributeFamily> {
    const family = await this.families.findById(id);
    if (!family) {
      throw new NotFoundException({
        code: 'FAMILY_NOT_FOUND',
        message: `Attribute family ${id} not found.`,
      });
    }
    return family;
  }
}
