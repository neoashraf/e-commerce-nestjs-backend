import { ApiProperty } from '@nestjs/swagger';

import { AttributeType } from '../../domain/enums/attribute-type.enum';

/** A row in the admin attribute list (contract: Admin — Attributes › GET). */
export class AttributeRowDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() admin_label: string;
  @ApiProperty({ enum: AttributeType }) type: AttributeType;
  @ApiProperty() is_required: boolean;
  @ApiProperty() is_unique: boolean;
  @ApiProperty() is_filterable: boolean;
  @ApiProperty() is_configurable: boolean;
  @ApiProperty() is_visible_on_front: boolean;
  @ApiProperty() is_comparable: boolean;
  @ApiProperty() is_user_defined: boolean;
}

/** A selectable option of a `select` / `multiselect` attribute. */
export class AttributeOptionDto {
  @ApiProperty() id: string;
  @ApiProperty() value: string;
  @ApiProperty() label: string;
  @ApiProperty({ nullable: true }) swatch_type: string | null;
  @ApiProperty({ nullable: true }) swatch_value: string | null;
  @ApiProperty() position: number;
}

/** Full attribute detail (list row + editor fields + options) — `GET /admin/attributes/{id}`. */
export class AttributeDetailDto extends AttributeRowDto {
  @ApiProperty({ nullable: true }) validation: string | null;
  @ApiProperty({ nullable: true }) default_value: string | null;
  @ApiProperty() position: number;
  @ApiProperty() is_active: boolean;
  @ApiProperty({ type: [AttributeOptionDto] }) options: AttributeOptionDto[];
}

export class ListMetaDto {
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 20 }) limit: number;
  @ApiProperty({ example: 42 }) total: number;
}

/** Enveloped list response `{ data, meta }` (paginated, SRS §7). */
export class AttributeListResponseDto {
  @ApiProperty({ type: [AttributeRowDto] }) data: AttributeRowDto[];
  @ApiProperty({ type: ListMetaDto }) meta: ListMetaDto;
}

class CreatedAttributeDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
}

/** `{ data: { id, code } }` returned on create. */
export class CreateAttributeResponseDto {
  @ApiProperty({ type: CreatedAttributeDto }) data: CreatedAttributeDto;
}

class UpdatedAttributeDto {
  @ApiProperty() id: string;
}

/** `{ data: { id } }` returned on update. */
export class UpdateAttributeResponseDto {
  @ApiProperty({ type: UpdatedAttributeDto }) data: UpdatedAttributeDto;
}
