import { BadRequestException, Injectable } from '@nestjs/common';

import { Attribute } from '../../domain/entities/attribute.entity';
import { AttributeType } from '../../domain/enums/attribute-type.enum';

/** Outcome of validating a (attribute, value) assignment. */
export interface AssignmentValidationResult {
  valid: boolean;
  /** Machine code when invalid (`UNKNOWN_OPTION`, `TYPE_MISMATCH`, `VALIDATION_FAILED`). */
  code?: string;
  message?: string;
}

/**
 * Reusable assignment-validation helper (FR-CAT-053): validates a product attribute value
 * against the attribute's `type` and (for select types) its allowed option set, rejecting
 * unknown options and type-mismatched values. Exposed for later product briefs — there is no
 * product endpoint in this slice. Select values are matched by option `value` or option `id`.
 */
@Injectable()
export class AttributeAssignmentValidator {
  validate(attribute: Attribute, rawValue: unknown): AssignmentValidationResult {
    // A required attribute must have a value; optional + empty is allowed.
    const isEmpty = rawValue === null || rawValue === undefined || rawValue === '';
    if (isEmpty) {
      return attribute.isRequired
        ? { valid: false, code: 'VALIDATION_FAILED', message: `"${attribute.code}" is required.` }
        : { valid: true };
    }

    switch (attribute.type) {
      case AttributeType.SELECT:
        return this.validateSelect(attribute, rawValue);
      case AttributeType.MULTISELECT:
        return this.validateMultiselect(attribute, rawValue);
      case AttributeType.BOOLEAN:
        return typeof rawValue === 'boolean'
          ? { valid: true }
          : this.mismatch(attribute, 'boolean');
      case AttributeType.INTEGER:
        return this.validateNumeric(attribute, rawValue, true);
      case AttributeType.DECIMAL:
      case AttributeType.PRICE:
        return this.validateNumeric(attribute, rawValue, false);
      case AttributeType.DATE:
      case AttributeType.DATETIME:
        return this.validateDate(attribute, rawValue);
      case AttributeType.TEXT:
      case AttributeType.TEXTAREA:
      case AttributeType.RICH_TEXT:
      case AttributeType.IMAGE:
      case AttributeType.FILE:
        return typeof rawValue === 'string'
          ? this.applyValidationRule(attribute, rawValue)
          : this.mismatch(attribute, 'string');
      default:
        return this.mismatch(attribute, attribute.type);
    }
  }

  /** Throwing variant for callers that want a `400` on the spot. */
  assertValid(attribute: Attribute, rawValue: unknown): void {
    const result = this.validate(attribute, rawValue);
    if (!result.valid) {
      throw new BadRequestException({
        code: result.code ?? 'INVALID_ATTRIBUTE_VALUE',
        message: result.message ?? `Invalid value for attribute "${attribute.code}".`,
      });
    }
  }

  private validateSelect(attribute: Attribute, rawValue: unknown): AssignmentValidationResult {
    if (typeof rawValue !== 'string') return this.mismatch(attribute, 'option value');
    return this.knownOption(attribute, rawValue)
      ? { valid: true }
      : this.unknownOption(attribute, rawValue);
  }

  private validateMultiselect(
    attribute: Attribute,
    rawValue: unknown,
  ): AssignmentValidationResult {
    if (!Array.isArray(rawValue)) return this.mismatch(attribute, 'array of option values');
    for (const entry of rawValue) {
      if (typeof entry !== 'string' || !this.knownOption(attribute, entry)) {
        return this.unknownOption(attribute, String(entry));
      }
    }
    return { valid: true };
  }

  private knownOption(attribute: Attribute, candidate: string): boolean {
    return attribute.options.some((o) => o.value === candidate || o.id === candidate);
  }

  private validateNumeric(
    attribute: Attribute,
    rawValue: unknown,
    integerOnly: boolean,
  ): AssignmentValidationResult {
    const num = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (typeof rawValue !== 'number' && typeof rawValue !== 'string') {
      return this.mismatch(attribute, integerOnly ? 'integer' : 'number');
    }
    if (Number.isNaN(num) || !Number.isFinite(num)) {
      return this.mismatch(attribute, integerOnly ? 'integer' : 'number');
    }
    if (integerOnly && !Number.isInteger(num)) {
      return this.mismatch(attribute, 'integer');
    }
    return this.applyValidationRule(attribute, String(num));
  }

  private validateDate(attribute: Attribute, rawValue: unknown): AssignmentValidationResult {
    if (typeof rawValue !== 'string' && !(rawValue instanceof Date)) {
      return this.mismatch(attribute, 'date');
    }
    const time = new Date(rawValue as string | Date).getTime();
    return Number.isNaN(time) ? this.mismatch(attribute, 'date') : { valid: true };
  }

  /** Applies the optional `validation` rule (a regex) when present. */
  private applyValidationRule(
    attribute: Attribute,
    value: string,
  ): AssignmentValidationResult {
    if (!attribute.validation) return { valid: true };
    try {
      const re = new RegExp(attribute.validation);
      if (!re.test(value)) {
        return {
          valid: false,
          code: 'VALIDATION_FAILED',
          message: `Value for "${attribute.code}" does not match its validation rule.`,
        };
      }
    } catch {
      // A non-regex validation hint is ignored here (enforced elsewhere); treat as pass.
      return { valid: true };
    }
    return { valid: true };
  }

  private mismatch(attribute: Attribute, expected: string): AssignmentValidationResult {
    return {
      valid: false,
      code: 'TYPE_MISMATCH',
      message: `Attribute "${attribute.code}" expects a ${expected} value.`,
    };
  }

  private unknownOption(attribute: Attribute, candidate: string): AssignmentValidationResult {
    return {
      valid: false,
      code: 'UNKNOWN_OPTION',
      message: `"${candidate}" is not a valid option for attribute "${attribute.code}".`,
    };
  }
}
