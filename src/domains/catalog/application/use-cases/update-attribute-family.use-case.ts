import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { AttributeFamily } from '../../domain/entities/attribute-family.entity';
import {
  ATTRIBUTE_FAMILY_REPOSITORY,
  IAttributeFamilyRepository,
} from '../../domain/repositories/attribute-family.repository.interface';
import { FamilyGroupingValidator, GroupCommand } from '../services/family-grouping.validator';

export interface UpdateAttributeFamilyCommand {
  id: string;
  name?: string;
  groups: GroupCommand[];
}

/**
 * Full-replaces a family's grouping and optionally its `name` (FR-CAT-061). The `code` is
 * immutable and is never accepted here (ignored at the presentation layer). Enforces the
 * same mandatory-attribute / unknown-code rules as create via the grouping validator.
 */
@Injectable()
export class UpdateAttributeFamilyUseCase {
  constructor(
    @Inject(ATTRIBUTE_FAMILY_REPOSITORY)
    private readonly families: IAttributeFamilyRepository,
    private readonly grouping: FamilyGroupingValidator,
  ) {}

  async execute(cmd: UpdateAttributeFamilyCommand): Promise<AttributeFamily> {
    const existing = await this.families.findById(cmd.id);
    if (!existing) {
      throw new NotFoundException({
        code: 'FAMILY_NOT_FOUND',
        message: `Attribute family ${cmd.id} not found.`,
      });
    }

    const groups = await this.grouping.validateAndResolve(cmd.groups);
    return this.families.update({ id: cmd.id, name: cmd.name, groups });
  }
}
