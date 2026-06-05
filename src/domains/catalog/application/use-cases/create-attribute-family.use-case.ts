import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';

import { AttributeFamily } from '../../domain/entities/attribute-family.entity';
import { isValidFamilyCode } from '../../domain/family-rules';
import {
  ATTRIBUTE_FAMILY_REPOSITORY,
  IAttributeFamilyRepository,
} from '../../domain/repositories/attribute-family.repository.interface';
import { FamilyGroupingValidator, GroupCommand } from '../services/family-grouping.validator';

export interface CreateAttributeFamilyCommand {
  code: string;
  name: string;
  groups: GroupCommand[];
}

/**
 * Creates an attribute family from `{ code, name, groups[] }` (FR-CAT-060/061/062).
 * Rejects a bad `code` format (`400`), an unknown attribute code / a missing mandatory
 * system attribute (`400`, via the grouping validator), and a duplicate `code` (`409`).
 */
@Injectable()
export class CreateAttributeFamilyUseCase {
  constructor(
    @Inject(ATTRIBUTE_FAMILY_REPOSITORY)
    private readonly families: IAttributeFamilyRepository,
    private readonly grouping: FamilyGroupingValidator,
  ) {}

  async execute(cmd: CreateAttributeFamilyCommand): Promise<AttributeFamily> {
    if (!isValidFamilyCode(cmd.code)) {
      throw new BadRequestException({
        code: 'INVALID_FAMILY_CODE',
        message: 'Family code must be 2–60 chars of lowercase letters, digits, or underscore.',
      });
    }

    const groups = await this.grouping.validateAndResolve(cmd.groups);

    if (await this.families.existsByCode(cmd.code)) {
      throw new ConflictException({
        code: 'FAMILY_CODE_EXISTS',
        message: `An attribute family with code "${cmd.code}" already exists.`,
      });
    }

    return this.families.create({ code: cmd.code, name: cmd.name, groups });
  }
}
