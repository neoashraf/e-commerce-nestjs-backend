import { ApiProperty } from '@nestjs/swagger';

/** `{ data: { id, slug, level, is_published } }` returned on create (FR-CAT-001). */
class CreatedCategoryDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'football-boots' }) slug: string;
  @ApiProperty({ example: 2 }) level: number;
  @ApiProperty({ example: false }) is_published: boolean;
}

export class CreateCategoryResponseDto {
  @ApiProperty({ type: CreatedCategoryDto }) data: CreatedCategoryDto;
}

/** `{ data: { id, is_published } }` returned on update (contract: PATCH). */
class UpdatedCategoryDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: true }) is_published: boolean;
}

export class UpdateCategoryResponseDto {
  @ApiProperty({ type: UpdatedCategoryDto }) data: UpdatedCategoryDto;
}

/** A node in the public, published+in-menu tree (FR-CAT-040). */
export class PublicCategoryNodeDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiProperty({ nullable: true, description: 'Category tile/thumbnail image (RW6); null → storefront colour-tint placeholder.' })
  image_url: string | null;
  @ApiProperty({ type: () => [PublicCategoryNodeDto] })
  children: PublicCategoryNodeDto[];
}

export class PublicCategoryTreeResponseDto {
  @ApiProperty({ type: [PublicCategoryNodeDto] }) data: PublicCategoryNodeDto[];
}

/** A node in the admin tree (full tree incl. drafts/unpublished; contract gap, SRS §16). */
export class AdminCategoryNodeDto {
  @ApiProperty() id: string;
  @ApiProperty({ nullable: true }) parent_id: string | null;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiProperty() level: number;
  @ApiProperty() position: number;
  @ApiProperty() is_published: boolean;
  @ApiProperty() show_in_menu: boolean;
  @ApiProperty() display_mode: string;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty({ nullable: true }) image_url: string | null;
  @ApiProperty({ nullable: true }) logo_url: string | null;
  @ApiProperty({ nullable: true }) banner_url: string | null;
  @ApiProperty({ nullable: true }) meta_title: string | null;
  @ApiProperty({ nullable: true }) meta_keywords: string | null;
  @ApiProperty({ nullable: true }) meta_description: string | null;
  @ApiProperty({ type: [String] }) filterable_attribute_codes: string[];
  @ApiProperty() is_deleted: boolean;
  @ApiProperty({ type: () => [AdminCategoryNodeDto] })
  children: AdminCategoryNodeDto[];
}

export class AdminCategoryTreeResponseDto {
  @ApiProperty({ type: [AdminCategoryNodeDto] }) data: AdminCategoryNodeDto[];
}
