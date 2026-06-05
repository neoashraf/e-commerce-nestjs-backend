import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Attribute } from '../../domain/entities/attribute.entity';
import { AttributeType, isOptionBearing } from '../../domain/enums/attribute-type.enum';
import { SwatchType } from '../../domain/enums/swatch-type.enum';
import {
  ATTRIBUTE_REPOSITORY,
  AttributeOptionInput,
  IAttributeRepository,
} from '../../domain/repositories/attribute.repository.interface';

export interface UpdateAttributeOptionCommand {
  id?: string;
  value: string;
  label: string;
  swatchType?: SwatchType | null;
  swatchValue?: string | null;
  position?: number;
}

export interface UpdateAttributeCommand {
  id: string;
  /** Present only to detect an illegal change attempt — `code` is immutable (FR-CAT-050). */
  code?: string;
  adminLabel?: string;
  type?: AttributeType;
  isRequired?: boolean;
  isUnique?: boolean;
  isFilterable?: boolean;
  isConfigurable?: boolean;
  isVisibleOnFront?: boolean;
  isComparable?: boolean;
  validation?: string | null;
  defaultValue?: string | null;
  position?: number;
  isActive?: boolean;
  options?: UpdateAttributeOptionCommand[];
}

/**
 * Updates an attribute's flag subset and (optionally) its option set (FR-CAT-055/057/058).
 * `code` is immutable (`400`). `is_configurable` stays valid only on `select` — a request to
 * set it on another type is `400`, and a type change away from `select` clears it (FR-CAT-027).
 * Removing an option still referenced by a product/variant → `400 OPTION_IN_USE` (FR-CAT-055).
 */
@Injectable()
export class UpdateAttributeUseCase {
  constructor(
    @Inject(ATTRIBUTE_REPOSITORY) private readonly attributes: IAttributeRepository,
  ) {}

  async execute(cmd: UpdateAttributeCommand): Promise<Attribute> {
    const current = await this.attributes.findById(cmd.id);
    if (!current) {
      throw new NotFoundException({
        code: 'ATTRIBUTE_NOT_FOUND',
        message: `Attribute ${cmd.id} not found.`,
      });
    }

    if (cmd.code !== undefined && cmd.code !== current.code) {
      throw new BadRequestException({
        code: 'ATTRIBUTE_CODE_IMMUTABLE',
        message: 'Attribute code cannot be changed after creation.',
      });
    }

    const newType = cmd.type ?? current.type;
    const isConfigurable = this.resolveConfigurable(cmd, current, newType);

    const reconciliation = cmd.options
      ? await this.reconcileOptions(cmd.id, current, newType, cmd.options)
      : undefined;

    return this.attributes.update({
      id: cmd.id,
      adminLabel: cmd.adminLabel,
      type: newType,
      isRequired: cmd.isRequired,
      isUnique: cmd.isUnique,
      isFilterable: cmd.isFilterable,
      isConfigurable,
      isVisibleOnFront: cmd.isVisibleOnFront,
      isComparable: cmd.isComparable,
      validation: cmd.validation,
      defaultValue: cmd.defaultValue,
      position: cmd.position,
      isActive: cmd.isActive,
      options: reconciliation?.options,
      removedOptionIds: reconciliation?.removedOptionIds,
    });
  }

  /** Resolve the final `is_configurable`, enforcing the select-only rule (FR-CAT-027). */
  private resolveConfigurable(
    cmd: UpdateAttributeCommand,
    current: Attribute,
    newType: AttributeType,
  ): boolean {
    if (newType !== AttributeType.SELECT) {
      if (cmd.isConfigurable === true) {
        throw new BadRequestException({
          code: 'CONFIGURABLE_NOT_SELECT',
          message: 'Only a `select` attribute may be configurable (variant-forming).',
        });
      }
      // Cleared on a type change away from select.
      return false;
    }
    return cmd.isConfigurable ?? current.isConfigurable;
  }

  private async reconcileOptions(
    attributeId: string,
    current: Attribute,
    newType: AttributeType,
    incoming: UpdateAttributeOptionCommand[],
  ): Promise<{ options: AttributeOptionInput[]; removedOptionIds: string[] }> {
    const currentIds = new Set(current.options.map((o) => o.id));

    // Every supplied id must belong to this attribute.
    for (const o of incoming) {
      if (o.id && !currentIds.has(o.id)) {
        throw new BadRequestException({
          code: 'UNKNOWN_OPTION',
          message: `Option ${o.id} does not belong to attribute "${current.code}".`,
        });
      }
    }
    this.assertUniqueOptionValues(incoming);

    if (isOptionBearing(newType) && incoming.length === 0) {
      throw new BadRequestException({
        code: 'ATTRIBUTE_OPTIONS_REQUIRED',
        message: 'A select / multiselect attribute requires at least one option.',
      });
    }

    const keptIds = new Set(incoming.filter((o) => o.id).map((o) => o.id as string));
    const removedOptionIds = current.options
      .filter((o) => !keptIds.has(o.id))
      .map((o) => o.id);

    // An option that is referenced by a product/variant cannot be removed (FR-CAT-055).
    for (const removedId of removedOptionIds) {
      if (await this.attributes.isOptionReferenced(removedId)) {
        throw new BadRequestException({
          code: 'OPTION_IN_USE',
          message: 'An option referenced by a product or variant cannot be removed; disable it instead.',
        });
      }
    }

    const options: AttributeOptionInput[] = incoming.map((o, idx) => ({
      id: o.id,
      value: o.value,
      label: o.label,
      swatchType: o.swatchType ?? null,
      swatchValue: o.swatchValue ?? null,
      position: o.position ?? idx + 1,
    }));

    return { options, removedOptionIds };
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
