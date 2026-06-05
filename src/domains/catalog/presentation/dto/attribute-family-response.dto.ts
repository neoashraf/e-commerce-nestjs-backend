import { ApiProperty } from '@nestjs/swagger';

/** A row in the admin family list (contract: Admin — Attribute Families › GET). */
export class AttributeFamilyRowDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() is_default: boolean;
}

/** Enveloped list response `{ data }` (FR-CAT-060). */
export class AttributeFamilyListResponseDto {
  @ApiProperty({ type: [AttributeFamilyRowDto] }) data: AttributeFamilyRowDto[];
}

/** One attribute placed in a group (GET detail). */
export class FamilyAttributeDto {
  @ApiProperty() id: string;
  @ApiProperty() attribute_id: string;
  @ApiProperty() code: string;
  @ApiProperty() admin_label: string;
  @ApiProperty() type: string;
  @ApiProperty() position: number;
}

/** One group with its ordered attributes (GET detail). */
export class FamilyGroupResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ example: 1 }) column: number;
  @ApiProperty({ example: 1 }) position: number;
  @ApiProperty({ type: [FamilyAttributeDto] }) attributes: FamilyAttributeDto[];
}

/** Full family detail used to prefill the editor (FR-CAT-061). */
export class AttributeFamilyDetailDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() is_default: boolean;
  @ApiProperty({ type: [FamilyGroupResponseDto] }) groups: FamilyGroupResponseDto[];
}

/** `{ data: { ...detail } }` returned on GET detail. */
export class AttributeFamilyDetailResponseDto {
  @ApiProperty({ type: AttributeFamilyDetailDto }) data: AttributeFamilyDetailDto;
}

class CreatedFamilyDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
}

/** `{ data: { id, code } }` returned on create. */
export class CreateAttributeFamilyResponseDto {
  @ApiProperty({ type: CreatedFamilyDto }) data: CreatedFamilyDto;
}

class UpdatedFamilyDto {
  @ApiProperty() id: string;
}

/** `{ data: { id } }` returned on update. */
export class UpdateAttributeFamilyResponseDto {
  @ApiProperty({ type: UpdatedFamilyDto }) data: UpdatedFamilyDto;
}
