import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { Attribute } from '../../domain/entities/attribute.entity';
import {
  ATTRIBUTE_REPOSITORY,
  IAttributeRepository,
} from '../../domain/repositories/attribute.repository.interface';

/** Fetch one attribute with its options for the admin editor prefill (FR-CAT-050/057). */
@Injectable()
export class GetAttributeUseCase {
  constructor(
    @Inject(ATTRIBUTE_REPOSITORY) private readonly attributes: IAttributeRepository,
  ) {}

  async execute(id: string): Promise<Attribute> {
    const attribute = await this.attributes.findById(id);
    if (!attribute) {
      throw new NotFoundException({
        code: 'ATTRIBUTE_NOT_FOUND',
        message: `Attribute ${id} not found.`,
      });
    }
    return attribute;
  }
}
