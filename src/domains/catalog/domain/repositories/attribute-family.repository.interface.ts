import { AttributeFamily } from '../entities/attribute-family.entity';

/** A resolved attribute reference (code → id) used to persist a family's grouping. */
export interface AttributeRef {
  id: string;
  code: string;
}

/** One group in a create/update grouping payload, with attributes already resolved to ids. */
export interface FamilyGroupInput {
  name: string;
  column: number;
  position: number;
  /** Resolved attribute ids in submitted (laid-out) order. */
  attributeIds: string[];
}

export interface CreateAttributeFamilyData {
  code: string;
  name: string;
  groups: FamilyGroupInput[];
}

export interface UpdateAttributeFamilyData {
  id: string;
  name?: string;
  groups: FamilyGroupInput[];
}

export interface IAttributeFamilyRepository {
  /** List shape `{ id, code, name, is_default }` (groups omitted) (FR-CAT-060). */
  findAll(): Promise<AttributeFamily[]>;
  /** Full family with ordered groups + ordered attributes (editor prefill) (FR-CAT-061). */
  findById(id: string): Promise<AttributeFamily | null>;
  existsByCode(code: string): Promise<boolean>;
  /** Resolves existing attributes by code (the found subset; unknown codes are omitted). */
  resolveAttributeCodes(codes: string[]): Promise<AttributeRef[]>;
  create(data: CreateAttributeFamilyData): Promise<AttributeFamily>;
  /** Full-replace of the grouping in a transaction (FR-CAT-061). */
  update(data: UpdateAttributeFamilyData): Promise<AttributeFamily>;
  delete(id: string): Promise<void>;
  /** True when any product references this family (FR-CAT-064). */
  isReferencedByProduct(id: string): Promise<boolean>;
}

export const ATTRIBUTE_FAMILY_REPOSITORY = Symbol('IAttributeFamilyRepository');
