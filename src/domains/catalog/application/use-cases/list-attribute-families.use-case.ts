import { Inject, Injectable } from '@nestjs/common';

import { AttributeFamily } from '../../domain/entities/attribute-family.entity';
import {
  ATTRIBUTE_FAMILY_REPOSITORY,
  IAttributeFamilyRepository,
} from '../../domain/repositories/attribute-family.repository.interface';

/** Lists all attribute families (list shape; FR-CAT-060). */
@Injectable()
export class ListAttributeFamiliesUseCase {
  constructor(
    @Inject(ATTRIBUTE_FAMILY_REPOSITORY)
    private readonly families: IAttributeFamilyRepository,
  ) {}

  execute(): Promise<AttributeFamily[]> {
    return this.families.findAll();
  }
}
