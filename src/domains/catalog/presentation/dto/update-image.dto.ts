import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Body for `PATCH /admin/products/{id}/images/{imageId}` (FR-CAT-032) — edit an existing image's
 * accessibility alt text. JSON (not multipart): the binary is never re-sent on a metadata edit.
 */
export class UpdateImageDto {
  @ApiProperty({ description: 'Required accessibility alt text', maxLength: 160 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  alt_text: string;
}
