import { Attribute } from '../entities/attribute.entity';
import { AttributeType } from '../enums/attribute-type.enum';
import { SwatchType } from '../enums/swatch-type.enum';

/** Filters for the admin attribute list (FR-CAT-050/057/058). */
export interface AttributeListFilter {
  page: number;
  limit: number;
  type?: AttributeType;
  filterable?: boolean;
  isRequired?: boolean;
  isUnique?: boolean;
  isUserDefined?: boolean;
  q?: string;
}

/** One desired option in a create/update payload; `id` present ⇒ update an existing row. */
export interface AttributeOptionInput {
  id?: string;
  value: string;
  label: string;
  swatchType: SwatchType | null;
  swatchValue: string | null;
  position: number;
}

/** New-attribute persistence payload (with its full option set). */
export interface CreateAttributeData {
  code: string;
  adminLabel: string;
  type: AttributeType;
  isRequired: boolean;
  isUnique: boolean;
  isFilterable: boolean;
  isConfigurable: boolean;
  isVisibleOnFront: boolean;
  isComparable: boolean;
  isUserDefined: boolean;
  validation: string | null;
  defaultValue: string | null;
  position: number;
  isActive: boolean;
  options: AttributeOptionInput[];
}

/**
 * Update payload. Scalar fields are applied only when provided; `type` and `isConfigurable`
 * are always the resolved final values (computed by the use case). `options === undefined`
 * leaves the option set untouched; otherwise the set is reconciled (upsert by id/insert,
 * delete the rest). `removedOptionIds` is the pre-validated delete set (already cleared of
 * OPTION_IN_USE references by the use case).
 */
export interface UpdateAttributeData {
  id: string;
  adminLabel?: string;
  type: AttributeType;
  isRequired?: boolean;
  isUnique?: boolean;
  isFilterable?: boolean;
  isConfigurable: boolean;
  isVisibleOnFront?: boolean;
  isComparable?: boolean;
  validation?: string | null;
  defaultValue?: string | null;
  position?: number;
  isActive?: boolean;
  options?: AttributeOptionInput[];
  removedOptionIds?: string[];
}

export interface IAttributeRepository {
  findAll(filter: AttributeListFilter): Promise<{ items: Attribute[]; total: number }>;
  findById(id: string): Promise<Attribute | null>;
  findByCode(code: string): Promise<Attribute | null>;
  existsByCode(code: string): Promise<boolean>;
  create(data: CreateAttributeData): Promise<Attribute>;
  update(data: UpdateAttributeData): Promise<Attribute>;
  delete(id: string): Promise<void>;
  /** True when any product attribute value / variant references this attribute (FR-CAT-055). */
  isAttributeReferenced(id: string): Promise<boolean>;
  /** True when any product attribute value / variant references this option (FR-CAT-055). */
  isOptionReferenced(optionId: string): Promise<boolean>;
}

export const ATTRIBUTE_REPOSITORY = Symbol('IAttributeRepository');
