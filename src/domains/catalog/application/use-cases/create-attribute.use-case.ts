import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';

import { isValidAttributeCode } from '../../domain/attribute-rules';
import { Attribute } from '../../domain/entities/attribute.entity';
import { AttributeType, isOptionBearing } from '../../domain/enums/attribute-type.enum';
import { SwatchType } from '../../domain/enums/swatch-type.enum';
import {
  ATTRIBUTE_REPOSITORY,
  AttributeOptionInput,
  IAttributeRepository,
} from '../../domain/repositories/attribute.repository.interface';

export interface CreateAttributeOptionCommand {
  value: string;
  label: string;
  swatchType?: SwatchType | null;
  swatchValue?: string | null;
  position?: number;
}

export interface CreateAttributeCommand {
  code: string;
  adminLabel: string;
  type: AttributeType;
  isRequired?: boolean;
  isUnique?: boolean;
  isFilterable?: boolean;
  isConfigurable?: boolean;
  isVisibleOnFront?: boolean;
  isComparable?: boolean;
  validation?: string | null;
  defaultValue?: string | null;
  position?: number;
  options?: CreateAttributeOptionCommand[];
}

/**
 * Creates a typed attribute (FR-CAT-050/051/057/058). Rejects a bad `code` format (`400`),
 * a duplicate `code` (`409`), `is_configurable` on a non-`select` type (`400`, FR-CAT-027),
 * and a `select`/`multiselect` with zero options (`400`).
 */
@Injectable()
export class CreateAttributeUseCase {
  constructor(
    @Inject(ATTRIBUTE_REPOSITORY) private readonly attributes: IAttributeRepository,
  ) {}

  async execute(cmd: CreateAttributeCommand): Promise<Attribute> {
    if (!isValidAttributeCode(cmd.code)) {
      throw new BadRequestException({
        code: 'INVALID_ATTRIBUTE_CODE',
        message: 'Attribute code must be 2–60 chars of lowercase letters, digits, or underscore.',
      });
    }

    const isConfigurable = cmd.isConfigurable ?? false;
    if (isConfigurable && cmd.type !== AttributeType.SELECT) {
      throw new BadRequestException({
        code: 'CONFIGURABLE_NOT_SELECT',
        message: 'Only a `select` attribute may be configurable (variant-forming).',
      });
    }

    const options = cmd.options ?? [];
    if (isOptionBearing(cmd.type) && options.length === 0) {
      throw new BadRequestException({
        code: 'ATTRIBUTE_OPTIONS_REQUIRED',
        message: 'A select / multiselect attribute requires at least one option.',
      });
    }
    this.assertUniqueOptionValues(options);

    if (await this.attributes.existsByCode(cmd.code)) {
      throw new ConflictException({
        code: 'ATTRIBUTE_CODE_EXISTS',
        message: `An attribute with code "${cmd.code}" already exists.`,
      });
    }

    const persistOptions: AttributeOptionInput[] = isOptionBearing(cmd.type)
      ? options.map((o, idx) => ({
          value: o.value,
          label: o.label,
          swatchType: o.swatchType ?? null,
          swatchValue: o.swatchValue ?? null,
          position: o.position ?? idx + 1,
        }))
      : [];

    return this.attributes.create({
      code: cmd.code,
      adminLabel: cmd.adminLabel,
      type: cmd.type,
      isRequired: cmd.isRequired ?? false,
      isUnique: cmd.isUnique ?? false,
      isFilterable: cmd.isFilterable ?? false,
      isConfigurable,
      isVisibleOnFront: cmd.isVisibleOnFront ?? true,
      isComparable: cmd.isComparable ?? false,
      isUserDefined: true,
      validation: cmd.validation ?? null,
      defaultValue: cmd.defaultValue ?? null,
      position: cmd.position ?? 0,
      isActive: true,
      options: persistOptions,
    });
  }

  private assertUniqueOptionValues(options: { value: string }[]): void {
    const seen = new Set<string>();
    for (const o of options) {
      if (seen.has(o.value)) {
        throw new BadRequestException({
          code: 'DUPLICATE_OPTION_VALUE',
          message: `Duplicate option value "${o.value}"; option values must be unique per attribute.`,
        });
      }
      seen.add(o.value);
    }
  }
}
