import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { MANDATORY_SYSTEM_ATTRIBUTE_CODES } from '../../domain/family-rules';
import {
  ATTRIBUTE_FAMILY_REPOSITORY,
  FamilyGroupInput,
  IAttributeFamilyRepository,
} from '../../domain/repositories/attribute-family.repository.interface';

/** One submitted group (presentation snake_case already unwrapped to a command shape). */
export interface GroupCommand {
  name: string;
  column: number;
  position: number;
  attributeCodes: string[];
}

/**
 * Validates a submitted `groups[]` grouping and resolves its attribute codes to ids,
 * preserving the submitted order (FR-CAT-061/062). Shared by create + update so both
 * enforce identical rules:
 * - every group name non-empty,
 * - no attribute assigned to more than one group within the family (would violate the
 *   unique (family_id, attribute_id) constraint),
 * - all attribute codes resolve to existing attributes (else `400`),
 * - all mandatory system attributes are present (else `400`).
 */
@Injectable()
export class FamilyGroupingValidator {
  constructor(
    @Inject(ATTRIBUTE_FAMILY_REPOSITORY)
    private readonly families: IAttributeFamilyRepository,
  ) {}

  async validateAndResolve(groups: GroupCommand[]): Promise<FamilyGroupInput[]> {
    for (const g of groups) {
      if (!g.name || g.name.trim().length === 0) {
        throw new BadRequestException({
          code: 'INVALID_GROUP_NAME',
          message: 'Every attribute group must have a non-empty name.',
        });
      }
    }

    // Detect an attribute placed in more than one group (across the whole family).
    const seen = new Set<string>();
    for (const g of groups) {
      for (const code of g.attributeCodes) {
        if (seen.has(code)) {
          throw new BadRequestException({
            code: 'DUPLICATE_ATTRIBUTE_IN_FAMILY',
            message: `Attribute "${code}" is assigned to more than one group; an attribute may appear once per family.`,
          });
        }
        seen.add(code);
      }
    }

    const allCodes = [...seen];
    const resolved = await this.families.resolveAttributeCodes(allCodes);
    const codeToId = new Map(resolved.map((a) => [a.code, a.id]));

    const unknown = allCodes.filter((c) => !codeToId.has(c));
    if (unknown.length > 0) {
      throw new BadRequestException({
        code: 'UNKNOWN_ATTRIBUTE_CODE',
        message: `Unknown attribute code(s): ${unknown.join(', ')}.`,
      });
    }

    const missing = MANDATORY_SYSTEM_ATTRIBUTE_CODES.filter((c) => !seen.has(c));
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'MISSING_MANDATORY_ATTRIBUTE',
        message: `Every family must include the mandatory system attributes; missing: ${missing.join(', ')}.`,
      });
    }

    return groups.map((g) => ({
      name: g.name,
      column: g.column,
      position: g.position,
      attributeIds: g.attributeCodes.map((c) => codeToId.get(c) as string),
    }));
  }
}
