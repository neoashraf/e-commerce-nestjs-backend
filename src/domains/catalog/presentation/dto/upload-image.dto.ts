import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Coerce multipart string form fields ("true"/"1") into booleans. */
function toBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  return value === 'true' || value === '1';
}

/**
 * Multipart image-upload fields (FR-CAT-030/031/032/033). The `file` itself is handled by
 * `FileInterceptor`; these are the accompanying form fields. `alt_text` is required.
 */
export class UploadImageDto {
  @ApiProperty({ description: 'Required accessibility alt text', maxLength: 160 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  alt_text: string;

  @ApiPropertyOptional({ description: 'Color attribute option this image represents' })
  @IsOptional()
  @IsUUID()
  color_option_id?: string;

  @ApiPropertyOptional({ description: 'Mark as the primary image' })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  is_primary?: boolean;

  @ApiPropertyOptional({ description: 'Gallery order' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt()
  display_order?: number;
}
