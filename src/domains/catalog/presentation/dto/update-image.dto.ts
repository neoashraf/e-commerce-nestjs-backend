import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

/**
 * Body for `PATCH /admin/products/{id}/images/{imageId}` (FR-CAT-032) — edit an existing image's
 * accessibility alt text and/or its colour-tag. JSON (not multipart): the binary is never re-sent on
 * a metadata edit. At least one field must be present (enforced in the service); `color_option_id:null`
 * clears the tag.
 */
export class UpdateImageDto {
  @ApiPropertyOptional({ description: 'Accessibility alt text (non-empty when sent)', maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  alt_text?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: "A `color` attribute option this image represents; null clears the tag",
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  color_option_id?: string | null;
}
