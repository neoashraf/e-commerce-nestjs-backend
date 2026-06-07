import { Inject, Injectable } from '@nestjs/common';

import { Attribute } from '../../domain/entities/attribute.entity';
import {
  ATTRIBUTE_REPOSITORY,
  AttributeListFilter,
  IAttributeRepository,
} from '../../domain/repositories/attribute.repository.interface';

export interface ListAttributesResult {
  items: Attribute[];
  total: number;
  page: number;
  limit: number;
}

/** Paginated, filtered admin attribute list (FR-CAT-050/057/058). */
@Injectable()
export class ListAttributesUseCase {
  constructor(
    @Inject(ATTRIBUTE_REPOSITORY) private readonly attributes: IAttributeRepository,
  ) {}

  async execute(filter: AttributeListFilter): Promise<ListAttributesResult> {
    const { items, total } = await this.attributes.findAll(filter);
    return { items, total, page: filter.page, limit: filter.limit };
  }
}
